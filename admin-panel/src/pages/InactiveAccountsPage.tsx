import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, Loader2, Play, RefreshCw, ShieldAlert, X } from "lucide-react";
import { api } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { DataTable } from "@/components/ui/DataTable";

interface InactiveUser {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: "customer" | "provider";
  location?: string | null;
  isAvailable?: boolean | null;
  lastActiveAt?: string | null;
  inactivityState: "warning" | "restricted" | "review";
  inactivityWarningSentAt?: string | null;
  inactivityRestrictedAt?: string | null;
  inactivityReviewAt?: string | null;
  joinedAt?: string | null;
}

interface InactivityResponse {
  users: InactiveUser[];
  total: number;
  page: number;
  limit: number;
  summary: { warning: number; restricted: number; review: number };
}

type Action = "remind" | "clear" | "deactivate";

function formatDate(value?: string | null) {
  if (!value) return "No recorded activity";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function stateStyle(state: InactiveUser["inactivityState"]) {
  if (state === "review") return "border-red-200 bg-red-50 text-red-700";
  if (state === "restricted") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export function InactiveAccountsPage() {
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const canWrite = hasPermission("users.write");
  const canRunSweep = hasPermission("settings.write");
  const [data, setData] = useState<InactivityResponse>({ users: [], total: 0, page: 1, limit: 25, summary: { warning: 0, restricted: 0, review: 0 } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("review");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InactiveUser | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await api<InactivityResponse>("/api/admin/inactivity", { params: { state, search, page, limit: 25 } });
      setData(response);
      const focus = new URLSearchParams(window.location.search).get("focus");
      if (focus) {
        const focused = response.users.find((user) => user.id === focus);
        if (focused) setSelected(focused);
      }
    } catch (error) {
      toast({ title: "Could not load inactive accounts", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [state, page]);
  useEffect(() => { const timer = window.setTimeout(() => { setPage(1); void load(); }, 350); return () => window.clearTimeout(timer); }, [search]);

  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const range = useMemo(() => ({ from: data.total ? (page - 1) * data.limit + 1 : 0, to: Math.min(page * data.limit, data.total) }), [data, page]);

  async function runSweep() {
    setWorking(true);
    try {
      const response = await api<{ result: { warned: number; restricted: number; queuedForReview: number } }>("/api/admin/inactivity/sweep", { method: "POST" });
      toast({ title: "Inactivity review completed", description: `${response.result.warned} warned, ${response.result.restricted} restricted, ${response.result.queuedForReview} queued for review.` });
      await load();
    } catch (error) {
      toast({ title: "Review could not run", description: (error as Error).message, variant: "destructive" });
    } finally { setWorking(false); }
  }

  async function submitAction() {
    if (!selected || !action) return;
    if (action !== "remind" && reason.trim().length < 5) {
      toast({ title: "Reason required", description: "Enter an operational reason of at least five characters.", variant: "destructive" });
      return;
    }
    setWorking(true);
    try {
      await api(`/api/admin/inactivity/${selected.id}/${action}`, { method: "POST", body: { reason: reason.trim() || undefined } });
      toast({ title: action === "remind" ? "Reminder sent" : action === "clear" ? "Review cleared" : "Account deactivated" });
      setAction(null); setReason(""); setSelected(null);
      await load();
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "destructive" });
    } finally { setWorking(false); }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Trust & Lifecycle"
        title="Inactive Account Review"
        description="Warn inactive users, pause provider matching, and review long-inactive accounts. Inactivity never causes automatic permanent deletion."
        actions={<>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /> Refresh</button>
          {canRunSweep ? <button type="button" onClick={runSweep} disabled={working} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{working ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run review</button> : null}
        </>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Warning", value: data.summary.warning, icon: BellRing, tone: "text-blue-700 bg-blue-50 border-blue-100" },
          { label: "Restricted", value: data.summary.restricted, icon: ShieldAlert, tone: "text-amber-800 bg-amber-50 border-amber-100" },
          { label: "Admin review", value: data.summary.review, icon: AlertTriangle, tone: "text-red-700 bg-red-50 border-red-100" },
        ].map(({ label, value, icon: Icon, tone }) => <div key={label} className={`rounded-2xl border p-4 ${tone}`}><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider opacity-75">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><Icon size={22} aria-hidden="true" /></div></div>)}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <label className="flex-1"><span className="sr-only">Search inactive accounts</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
          <label><span className="sr-only">Filter inactivity state</span><select value={state} onChange={(event) => { setState(event.target.value); setPage(1); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:w-48"><option value="review">Admin review</option><option value="restricted">Restricted</option><option value="warning">Warning</option><option value="all">All inactive states</option></select></label>
        </div>
        <DataTable
          caption="Inactive account lifecycle queue"
          data={data.users}
          loading={loading}
          keyExtractor={(user) => user.id}
          emptyMessage="No accounts in this queue"
          emptyDescription="The selected inactivity state has no matching accounts."
          columns={[
            { header: "User", render: (user) => <div><p className="font-semibold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.role} · {user.phone}</p><p className="text-xs text-slate-400">{user.email || "No email"}</p></div> },
            { header: "Lifecycle", render: (user) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${stateStyle(user.inactivityState)}`}>{user.inactivityState}</span> },
            { header: "Last activity", render: (user) => <div className="flex items-center gap-2 text-xs text-slate-600"><Clock3 size={14} aria-hidden="true" />{formatDate(user.lastActiveAt)}</div> },
            { header: "Provider matching", render: (user) => user.role === "provider" ? <span className="text-xs font-medium text-slate-700">{user.isAvailable ? "Available" : "Paused"}</span> : <span className="text-xs text-slate-400">Not applicable</span> },
            { header: "Actions", render: (user) => <button type="button" onClick={() => setSelected(user)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50" aria-label={`Review ${user.name}`}>Review</button> },
          ]}
        />
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Showing {range.from}–{range.to} of {data.total}</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
      </div>

      {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="inactive-review-title"><div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><h2 id="inactive-review-title" className="text-lg font-semibold text-slate-950">Review {selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.role} · Last active {formatDate(selected.lastActiveAt)}</p></div><button type="button" onClick={() => { setSelected(null); setAction(null); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close review"><X size={18} /></button></div><div className="space-y-4 p-5"><div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><p><strong>State:</strong> {selected.inactivityState}</p><p className="mt-1"><strong>Contact:</strong> {selected.phone} · {selected.email || "No email"}</p><p className="mt-1"><strong>Location:</strong> {selected.location || "Not provided"}</p></div>{canWrite ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><button type="button" onClick={() => setAction("remind")} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Send reminder</button><button type="button" onClick={() => setAction("clear")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Clear review</button><button type="button" onClick={() => setAction("deactivate")} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Deactivate</button></div> : <p className="text-sm text-amber-700">Read-only access. User write permission is required for actions.</p>}{action ? <div className="rounded-xl border border-slate-200 p-4"><label className="text-xs font-semibold uppercase tracking-wider text-slate-600">{action === "remind" ? "Optional reminder message" : "Required operational reason"}<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-blue-500" /></label><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => { setAction(null); setReason(""); }} className="rounded-lg border px-3 py-2 text-sm">Cancel</button><button type="button" onClick={submitAction} disabled={working} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${action === "deactivate" ? "bg-red-600" : "bg-blue-600"}`}>{working ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm</button></div></div> : null}</div></div></div> : null}
    </div>
  );
}
