import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2, Plus, Pencil, Trash2, X, Crown, CheckCircle2, XCircle, ImageIcon } from "lucide-react";
import { openAuthenticatedFile } from "@/lib/api";
import { BulkActionBar } from "@/components/admin/BulkActionBar";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  audience: "provider" | "customer" | "both";
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

type Sub = {
  id: string;
  userId: string;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  status: "pending" | "active" | "expired" | "cancelled" | "rejected" | "cancellation_scheduled";
  amount: number;
  paymentReference: string | null;
  screenshotUrl: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  userName: string | null;
  userPhone: string | null;
  userEmail: string | null;
  userRole: string | null;
  planName: string | null;
  planAudience: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionNote?: string | null;
};

export function SubscriptionPlansPage() {
  const { hasPermission } = usePermissions();
  const canReadSettings = hasPermission("settings.read");
  const canWriteSettings = hasPermission("settings.write");
  const canReadFinance = hasPermission("finance.read");
  const canWriteFinance = hasPermission("finance.write");
  const query = new URLSearchParams(window.location.search);
  const requestedTab = query.get("tab");
  const initialTab: "plans" | "subs" = requestedTab === "subs" && canReadFinance
    ? "subs"
    : requestedTab === "plans" && canReadSettings
      ? "plans"
      : canReadSettings ? "plans" : "subs";
  const [tab, setTab] = useState<"plans" | "subs">(initialTab);
  const initialStatus = query.get("status") || "pending";
  const focusId = query.get("focus") || "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Premium Plans</h1>
        <p className="text-sm text-slate-500">Manage paid plans and approve provider/customer subscriptions.</p>
      </div>
      <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1">
        {canReadSettings && <button onClick={() => setTab("plans")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "plans" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Plans</button>}
        {canReadFinance && <button onClick={() => setTab("subs")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "subs" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Subscriptions</button>}
      </div>
      {!canReadSettings && !canReadFinance ? <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">You do not have permission to view subscriptions.</div> :
        tab === "plans" ? <PlansList canWrite={canWriteSettings} /> : <SubsList canWrite={canWriteFinance} initialStatus={initialStatus} focusId={focusId} />}
    </div>
  );
}

function PlansList({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [show, setShow] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => api<{ plans: Plan[] }>(`/api/admin/subscriptions/plans`),
  });
  const save = useMutation({
    mutationFn: (p: Partial<Plan> & { id?: string }) => {
      const { id, ...body } = p;
      return id
        ? api(`/api/admin/subscriptions/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/api/admin/subscriptions/plans`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "plans"] }); setShow(false); setEditing(null); toast({ title: "Saved" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/admin/subscriptions/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
  const plans = data?.plans ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && <button onClick={() => { setEditing(null); setShow(true); }} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
          <Plus size={16} /> New plan
        </button>}
      </div>
      {canWrite && show && <PlanForm initial={editing} onCancel={() => { setShow(false); setEditing(null); }} onSave={(p) => save.mutate({ ...p, id: editing?.id })} saving={save.isPending} />}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? <div className="col-span-full flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> :
          plans.length === 0 ? <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">No plans yet.</div> :
          plans.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Crown size={18} className="text-yellow-500" />
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.isActive ? "Active" : "Inactive"}</span>
              </div>
              {p.description && <p className="text-sm text-slate-500 mt-2">{p.description}</p>}
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">Rs {p.priceMonthly.toLocaleString()}</span>
                <span className="text-sm text-slate-500">/ month</span>
              </div>
              {p.priceYearly > 0 && <p className="text-xs text-slate-500">or Rs {p.priceYearly.toLocaleString()} / year</p>}
              <p className="text-xs text-slate-500 mt-1 capitalize">For {p.audience}</p>
              {Array.isArray(p.features) && p.features.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="text-sm text-slate-700 flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex justify-end gap-1">
                {canWrite ? <><button onClick={() => { setEditing(p); setShow(true); }} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><Pencil size={16} /></button>
                {confirmDeleteId === p.id ? (
                  <span className="inline-flex items-center gap-1">
                    <button onClick={() => { del.mutate(p.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Confirm</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDeleteId(p.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                )}</> : <span className="text-xs text-slate-400">Read only</span>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function PlanForm({ initial, onCancel, onSave, saving }: { initial: Plan | null; onCancel: () => void; onSave: (p: Partial<Plan>) => void; saving: boolean }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [audience, setAudience] = useState<"provider" | "customer" | "both">(initial?.audience ?? "provider");
  const [priceMonthly, setPriceMonthly] = useState(String(initial?.priceMonthly ?? 0));
  const [priceYearly, setPriceYearly] = useState(String(initial?.priceYearly ?? 0));
  const [features, setFeatures] = useState((initial?.features ?? []).join("\n"));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900">{initial ? `Edit ${initial.name}` : "New plan"}</h2>
        <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className="i" /></Field>
        <Field label="Audience">
          <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className="i">
            <option value="provider">Providers</option>
            <option value="customer">Customers</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="Description" wide><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="i min-h-[60px]" /></Field>
        <Field label="Monthly price (PKR)"><input type="number" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} className="i" /></Field>
        <Field label="Yearly price (PKR)"><input type="number" value={priceYearly} onChange={(e) => setPriceYearly(e.target.value)} className="i" /></Field>
        <Field label="Features (one per line)" wide><textarea value={features} onChange={(e) => setFeatures(e.target.value)} className="i min-h-[100px] font-mono text-xs" placeholder={"Top placement\nNo booking fees\nPriority support"} /></Field>
        <Field label="Sort order"><input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="i" /></Field>
        <Field label="Active"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Visible to users</label></Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">Cancel</button>
        <button
          disabled={saving || !name.trim()}
          onClick={() => onSave({
            name, description: description || null, audience,
            priceMonthly: Number(priceMonthly) || 0, priceYearly: Number(priceYearly) || 0,
            features: features.split("\n").map((s) => s.trim()).filter(Boolean),
            isActive, sortOrder: Number(sortOrder) || 0,
          } as any)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </div>
      <style>{`.i{width:100%;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.i:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1)}`}</style>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "md:col-span-2" : undefined}><label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>{children}</div>;
}

function SubsList({ canWrite, initialStatus, focusId }: { canWrite: boolean; initialStatus: string; focusId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  type SubscriptionStatus = "pending" | "active" | "expired" | "cancelled" | "rejected" | "cancellation_scheduled";
  const validStatus = (["pending", "active", "expired", "cancelled", "rejected", "cancellation_scheduled"] as const).includes(initialStatus as SubscriptionStatus)
    ? initialStatus as SubscriptionStatus
    : "pending";
  const [status, setStatus] = useState<SubscriptionStatus>(validStatus);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subs", status],
    queryFn: () => api<{ subscriptions: Sub[] }>(`/api/admin/subscriptions`, { params: { status } }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/admin/subscriptions/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({ title: "Premium subscription activated" });
    },
    onError: (error: any) => toast({ title: "Approval failed", description: error.message, variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`/api/admin/subscriptions/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({ title: "Subscription rejected" });
    },
    onError: (error: any) => toast({ title: "Rejection failed", description: error.message, variant: "destructive" }),
  });
  const items = data?.subscriptions ?? [];
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(["pending", "active", "cancellation_scheduled", "expired", "cancelled", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => { setStatus(s); setSelectedIds(new Set()); }} className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${status === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      {status === "pending" && canWrite && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          actions={[
            { label: "Approve selected", onClick: async () => { for (const id of selectedIds) await approve.mutateAsync(id); setSelectedIds(new Set()); } },
            { label: "Reject selected", tone: "danger", onClick: async () => { const reason = prompt("Rejection reason for selected subscriptions?")?.trim(); if (!reason) return; for (const id of selectedIds) await reject.mutateAsync({ id, reason }); setSelectedIds(new Set()); } },
          ]}
        />
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> :
          items.length === 0 ? <div className="text-center py-16 text-slate-500">No {status} subscriptions.</div> :
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 w-10"><input type="checkbox" aria-label="Select all pending subscriptions" disabled={status !== "pending" || !canWrite} checked={status === "pending" && items.length > 0 && items.every((item) => selectedIds.has(item.id))} onChange={() => setSelectedIds(items.every((item) => selectedIds.has(item.id)) ? new Set() : new Set(items.map((item) => item.id)))} /></th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Plan / period</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Payment proof</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((s) => {
                const rowBusy = (approve.isPending && approve.variables === s.id) || (reject.isPending && reject.variables?.id === s.id);
                const focused = s.id === focusId;
                return (
                <tr key={s.id} data-focus-id={focused ? s.id : undefined} className={focused ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50"}>
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Select subscription ${s.id}`} disabled={s.status !== "pending" || !canWrite} checked={selectedIds.has(s.id)} onChange={() => setSelectedIds((previous) => { const next = new Set(previous); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })} /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.userName || "Unknown user"}</div>
                    <div className="text-xs text-slate-500">{s.userPhone || s.userEmail || `${s.userId.slice(0, 8)}…`}</div>
                    <div className="text-xs text-slate-400 capitalize">{s.userRole || "user"}{focused ? " · Opened from notification" : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{s.planName || "Unknown plan"}</div>
                    <div className="text-xs text-slate-500 capitalize">{s.billingPeriod} · {s.planAudience || "all"}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold">Rs {s.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {s.paymentReference ? <span className="text-xs text-slate-600 font-mono">{s.paymentReference}</span> : <span className="text-xs text-slate-400">No reference</span>}
                      {s.screenshotUrl ? (
                        <button
                          onClick={() => openAuthenticatedFile(`/api/storage/objects/${String(s.screenshotUrl).replace(/^\/objects\//, "")}`)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline w-fit"
                        >
                          <ImageIcon size={12} /> View screenshot
                        </button>
                      ) : <span className="text-xs text-red-500">No screenshot</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-500">{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {s.status === "pending" && canWrite ? (
                      <div className="inline-flex gap-1">
                        <button disabled={rowBusy} onClick={() => approve.mutate(s.id)} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"><CheckCircle2 size={14} /> Approve</button>
                        <button disabled={rowBusy} onClick={() => { const r = prompt("Rejection reason?") ?? ""; if (r.trim()) reject.mutate({ id: s.id, reason: r }); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"><XCircle size={14} /> Reject</button>
                      </div>
                    ) : <div className="text-right"><span className="text-xs text-slate-500 capitalize">{s.status.replace(/_/g, " ")}</span>{s.rejectionNote && <p className="text-xs text-red-600 mt-1 max-w-[180px]">{s.rejectionNote}</p>}</div>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}

