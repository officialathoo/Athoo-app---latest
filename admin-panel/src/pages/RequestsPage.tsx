import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, openAuthenticatedFile } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { BulkActionBar } from "@/components/admin/BulkActionBar";

type ServiceStatus = "pending" | "approved" | "rejected";
type DeletionStatus = "pending" | "cancelled" | "completed";

type ServiceReq = {
  id: string;
  providerId: string;
  providerName: string | null;
  providerPhone: string | null;
  serviceCategoryId: string | null;
  serviceName: string;
  documents: { type: string; url: string; label?: string }[] | null;
  note: string | null;
  status: ServiceStatus;
  rejectionReason?: string | null;
  createdAt: string;
};

type DeletionReq = {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  reason: string | null;
  scheduledDeleteAt: string;
  status: DeletionStatus;
  createdAt: string;
};

function initialRequestParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") === "deletions" ? "deletions" : "services";
  return {
    tab: tab as "services" | "deletions",
    status: params.get("status") || "pending",
    focus: params.get("focus") || "",
  };
}

export function RequestsPage() {
  const initial = initialRequestParams();
  const [tab, setTab] = useState<"services" | "deletions">(initial.tab);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Requests</h1>
        <p className="text-sm text-slate-500">Review provider service additions and account deletion grace-period requests.</p>
      </div>
      <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1">
        <button onClick={() => setTab("services")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "services" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Service add requests</button>
        <button onClick={() => setTab("deletions")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "deletions" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Account deletions</button>
      </div>
      {tab === "services"
        ? <ServiceReqs initialStatus={initial.status} focusId={initial.focus} />
        : <DeletionReqs initialStatus={initial.status} focusId={initial.focus} />}
    </div>
  );
}

function ServiceReqs({ initialStatus, focusId }: { initialStatus: string; focusId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const validInitial = (["pending", "approved", "rejected"] as const).includes(initialStatus as ServiceStatus) ? initialStatus as ServiceStatus : "pending";
  const [status, setStatus] = useState<ServiceStatus>(validInitial);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "service-requests", status],
    queryFn: () => api<{ requests: ServiceReq[] }>(`/api/admin/account/service-requests`, { params: { status } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["providers"] });
    qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
    qc.invalidateQueries({ queryKey: ["admin-notifications"] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/admin/account/service-requests/${id}/approve`, { method: "POST" }),
    onSuccess: () => { refresh(); toast({ title: "Service approved" }); },
    onError: (error: any) => toast({ title: "Approval failed", description: error.message, variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`/api/admin/account/service-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { refresh(); toast({ title: "Service request rejected" }); },
    onError: (error: any) => toast({ title: "Rejection failed", description: error.message, variant: "destructive" }),
  });
  const items = data?.requests ?? [];
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(["pending", "approved", "rejected"] as const).map((value) => (
          <button key={value} onClick={() => { setStatus(value); setSelectedIds(new Set()); }} className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${status === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{value}</button>
        ))}
      </div>
      {status === "pending" && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          actions={[
            { label: "Approve selected", onClick: async () => { for (const id of selectedIds) await approve.mutateAsync(id); setSelectedIds(new Set()); } },
            { label: "Reject selected", tone: "danger", onClick: async () => { const reason = prompt("Reason for rejecting selected requests?")?.trim(); if (!reason) return; for (const id of selectedIds) await reject.mutateAsync({ id, reason }); setSelectedIds(new Set()); } },
          ]}
        />
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {status === "pending" && items.length > 0 && (
          <label className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 text-sm text-slate-600">
            <input type="checkbox" aria-label="Select all pending requests" checked={items.every((item) => selectedIds.has(item.id))} onChange={() => setSelectedIds(items.every((item) => selectedIds.has(item.id)) ? new Set() : new Set(items.map((item) => item.id)))} />
            Select all pending requests
          </label>
        )}
        {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> :
          items.length === 0 ? <div className="text-center py-16 text-slate-500">No {status} requests.</div> :
          items.map((request) => {
            const focused = request.id === focusId;
            return (
              <div key={request.id} data-focus-id={focused ? request.id : undefined} className={`border-b border-slate-100 p-4 ${focused ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  {request.status === "pending" && <input type="checkbox" aria-label={`Select ${request.serviceName}`} checked={selectedIds.has(request.id)} onChange={() => setSelectedIds((previous) => { const next = new Set(previous); next.has(request.id) ? next.delete(request.id) : next.add(request.id); return next; })} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900">{request.serviceName}</h3>
                      <span className="text-xs text-slate-500">by {request.providerName || request.providerId.slice(0, 8)}</span>
                      {request.providerPhone && <span className="text-xs text-slate-400">{request.providerPhone}</span>}
                      {focused && <span className="text-xs font-medium bg-blue-600 text-white px-2 py-0.5 rounded-full">Opened from notification</span>}
                    </div>
                    {request.note && <p className="text-sm text-slate-600 mt-1">{request.note}</p>}
                    {request.rejectionReason && <p className="text-xs text-red-600 mt-1">Reason: {request.rejectionReason}</p>}
                    {Array.isArray(request.documents) && request.documents.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {request.documents.map((document, index) => (
                          <button key={`${document.url}-${index}`} type="button" onClick={() => openAuthenticatedFile(`/api/storage/objects/${String(document.url).replace(/^\/objects\//, "")}`)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline border border-blue-100 bg-blue-50 px-2 py-1 rounded">
                            <ExternalLink size={11} /> {document.label || document.type || `Document ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{new Date(request.createdAt).toLocaleString()}</p>
                  </div>
                  {request.status === "pending" && (
                    <div className="flex gap-1 shrink-0">
                      <button disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate(request.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200 disabled:opacity-50"><CheckCircle2 size={14} /> Approve</button>
                      <button disabled={approve.isPending || reject.isPending} onClick={() => { const reason = prompt("Reason?")?.trim(); if (reason) reject.mutate({ id: request.id, reason }); }} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 disabled:opacity-50"><XCircle size={14} /> Reject</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function DeletionReqs({ initialStatus, focusId }: { initialStatus: string; focusId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const validInitial = (["pending", "cancelled", "completed"] as const).includes(initialStatus as DeletionStatus) ? initialStatus as DeletionStatus : "pending";
  const [status, setStatus] = useState<DeletionStatus>(validInitial);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "deletion-requests", status],
    queryFn: () => api<{ requests: DeletionReq[] }>(`/api/admin/account/deletion-requests`, { params: { status } }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/admin/account/deletion-requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({ title: "Account restored and deletion cancelled" });
    },
    onError: (error: any) => toast({ title: "Restore failed", description: error.message, variant: "destructive" }),
  });
  const items = data?.requests ?? [];
  const pendingItems = items.filter((item) => item.status === "pending");
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((item) => selectedIds.has(item.id));
  const restoreSelected = async () => { for (const id of selectedIds) await cancel.mutateAsync(id); setSelectedIds(new Set()); };

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(["pending", "cancelled", "completed"] as const).map((value) => (
          <button key={value} onClick={() => { setStatus(value); setSelectedIds(new Set()); }} className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${status === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{value}</button>
        ))}
      </div>
      {status === "pending" && selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} actions={[{ label: "Restore selected", onClick: restoreSelected }]} />}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> :
          items.length === 0 ? <div className="text-center py-16 text-slate-500">No {status} requests.</div> :
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left"><tr>
              <th className="px-4 py-3 font-medium w-10"><input type="checkbox" aria-label="Select all pending deletion requests" disabled={status !== "pending" || pendingItems.length === 0} checked={allPendingSelected} onChange={() => setSelectedIds(allPendingSelected ? new Set() : new Set(pendingItems.map((item) => item.id)))} /></th>
              <th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Reason</th><th className="px-4 py-3 font-medium">Requested</th><th className="px-4 py-3 font-medium">Scheduled delete</th><th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((request) => {
                const days = Math.max(0, Math.ceil((+new Date(request.scheduledDeleteAt) - Date.now()) / 86400000));
                const focused = request.id === focusId;
                return <tr key={request.id} data-focus-id={focused ? request.id : undefined} className={focused ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50"}>
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`Select deletion request for ${request.userName || request.id}`} disabled={request.status !== "pending"} checked={selectedIds.has(request.id)} onChange={() => setSelectedIds((previous) => { const next = new Set(previous); next.has(request.id) ? next.delete(request.id) : next.add(request.id); return next; })} /></td>
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{request.userName || "Unknown"}</div>{request.userPhone && <div className="text-xs text-slate-500">{request.userPhone}</div>}{focused && <div className="text-xs text-blue-700 mt-1">Opened from notification</div>}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs">{request.reason || <span className="text-slate-400 italic">No reason provided</span>}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(request.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><div className="text-slate-700">{new Date(request.scheduledDeleteAt).toLocaleDateString()}</div>{request.status === "pending" && <div className="text-xs text-amber-600">{days} day{days === 1 ? "" : "s"} left</div>}</td>
                  <td className="px-4 py-3 text-right">{request.status === "pending" && (confirmRestoreId === request.id ? <span className="inline-flex items-center gap-1"><button onClick={() => { cancel.mutate(request.id); setConfirmRestoreId(null); }} className="px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg">Restore</button><button onClick={() => setConfirmRestoreId(null)} className="px-2 py-1.5 text-xs text-slate-500">Cancel</button></span> : <button onClick={() => setConfirmRestoreId(request.id)} className="px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200">Restore</button>)}</td>
                </tr>;
              })}
            </tbody>
          </table>}
      </div>
    </div>
  );
}
