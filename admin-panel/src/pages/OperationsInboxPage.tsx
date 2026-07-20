import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { api, formatDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCheck, Clock3, Inbox, RefreshCw, Search, ShieldAlert } from "lucide-react";

interface WorkItem {
  resourceType: string;
  id: string;
  status: string;
  title: string;
  description: string;
  personId?: string | null;
  personName?: string | null;
  personPublicId?: string | null;
  priority: "critical" | "high" | "normal";
  createdAt?: string | null;
  href: string;
  seen: boolean;
}

interface InboxResponse {
  items: WorkItem[];
  summary: { totalOpen: number; unseen: number; critical: number; high: number };
  generatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  admin_notification: "Admin notification",
  inactive_account_review: "Inactive account review",
  provider_verification: "Provider verification",
  document_renewal: "Document renewal",
  refund: "Refund",
  withdrawal: "Withdrawal",
  commission_payment: "Commission payment",
  subscription: "Subscription",
  support_ticket: "Support ticket",
  reported_issue: "Reported issue",
  service_request: "Service request",
  deletion_request: "Deletion request",
  rate_request: "Rate request",
  overdue_negotiation: "Overdue negotiation",
};

export function OperationsInboxPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [summary, setSummary] = useState<InboxResponse["summary"]>({ totalOpen: 0, unseen: 0, critical: 0, high: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<InboxResponse>("/api/admin/operations-inbox", {
        params: {
          search: search.trim() || undefined,
          type: type === "all" ? undefined : type,
          visibility: visibility === "all" ? undefined : visibility,
          from: from || undefined,
          to: to || undefined,
        },
      });
      setItems(response.items || []);
      setSummary(response.summary || { totalOpen: 0, unseen: 0, critical: 0, high: 0 });
      setSelected(new Set());
    } catch (error) {
      toast({ title: "Operations inbox unavailable", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [from, search, to, type, visibility]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedItems = useMemo(() => items.filter((item) => selected.has(`${item.resourceType}:${item.id}`)), [items, selected]);

  async function markSeen(targets: WorkItem[]) {
    const unseen = targets.filter((item) => !item.seen);
    if (!unseen.length) return;
    setMarking(true);
    try {
      const payload = unseen.map((item) => ({ resourceType: item.resourceType, resourceId: item.id }));
      // The API deliberately bounds each write. Batch large cross-queue selections
      // rather than silently marking more rows in the UI than the server stored.
      for (let index = 0; index < payload.length; index += 200) {
        await api("/api/admin/operations-inbox/seen", {
          method: "POST",
          body: { items: payload.slice(index, index + 200) },
        });
      }
      const seenKeys = new Set(unseen.map((item) => `${item.resourceType}:${item.id}`));
      setItems((current) => current.map((item) => seenKeys.has(`${item.resourceType}:${item.id}`) ? { ...item, seen: true } : item));
      setSummary((current) => ({ ...current, unseen: Math.max(0, current.unseen - unseen.length) }));
      setSelected(new Set());
      toast({ title: `${unseen.length} work item${unseen.length === 1 ? "" : "s"} marked seen` });
    } catch (error) {
      toast({ title: "Could not update inbox", description: (error as Error).message, variant: "destructive" });
    } finally {
      setMarking(false);
    }
  }

  const cards = [
    { label: "Open workload", value: summary.totalOpen, icon: Inbox, className: "text-blue-700 bg-blue-50" },
    { label: "Unseen", value: summary.unseen, icon: Clock3, className: "text-orange-700 bg-orange-50" },
    { label: "Critical", value: summary.critical, icon: ShieldAlert, className: "text-red-700 bg-red-50" },
    { label: "High priority", value: summary.high, icon: AlertTriangle, className: "text-amber-700 bg-amber-50" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">One queue for every unresolved verification, finance, support and operational request.</p>
        </div>
        <div className="flex gap-2">
          <button disabled={marking || summary.unseen === 0} onClick={() => markSeen(items)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">
            <CheckCheck size={16} /> Mark visible seen
          </button>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, className }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><div className={`rounded-lg p-2 ${className}`}><Icon size={18} /></div></div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, Athoo ID, request or description" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" /></div>
          <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">All work types</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Seen & unseen</option><option value="unseen">Unseen only</option><option value="seen">Seen only</option></select>
          <input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>

        {selectedItems.length > 0 ? <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm"><span className="font-medium text-blue-900">{selectedItems.length} selected</span><button disabled={marking} onClick={() => markSeen(selectedItems)} className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">Mark selected seen</button></div> : null}

        <div className="divide-y divide-slate-100">
          {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading operations workload…</div> : items.length === 0 ? <div className="p-12 text-center"><CheckCheck className="mx-auto text-green-600" size={32} /><p className="mt-3 font-semibold text-slate-800">No matching unresolved work</p><p className="mt-1 text-sm text-slate-500">Every item in this filtered queue is currently clear.</p></div> : items.map((item) => {
            const key = `${item.resourceType}:${item.id}`;
            return <div key={key} className={`flex gap-3 p-4 ${item.seen ? "bg-white" : "bg-orange-50/50"}`}>
              <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.has(key)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.priority === "critical" ? "bg-red-100 text-red-800" : item.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{item.priority}</span><span className="text-xs font-medium text-slate-500">{TYPE_LABELS[item.resourceType] || item.resourceType}</span>{!item.seen ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">NEW</span> : null}</div>
                <p className="mt-2 font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.description}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">{item.personName ? <span>{item.personName}</span> : null}{item.personPublicId ? <span className="font-mono font-semibold text-slate-700">{item.personPublicId}</span> : null}{item.createdAt ? <span>{formatDate(item.createdAt)}</span> : null}<span>Status: {item.status}</span></div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2"><Link to={item.href} onClick={() => markSeen([item])} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Open</Link>{item.seen ? <span className="text-xs text-slate-400">Seen</span> : null}</div>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
