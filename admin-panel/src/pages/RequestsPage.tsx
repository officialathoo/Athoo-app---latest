import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Trash2 } from "lucide-react";

type ServiceReq = {
  id: string;
  providerId: string;
  providerName: string | null;
  providerPhone: string | null;
  serviceCategoryId: string | null;
  serviceName: string;
  documents: { type: string; url: string; label?: string }[] | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

type DeletionReq = {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  reason: string | null;
  scheduledDeleteAt: string;
  status: "pending" | "cancelled" | "completed";
  createdAt: string;
};

export function RequestsPage() {
  const [tab, setTab] = useState<"services" | "deletions">("services");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Requests</h1>
        <p className="text-sm text-slate-500">Service-add requests and account deletion grace queue.</p>
      </div>
      <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1">
        <button onClick={() => setTab("services")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "services" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Service add requests</button>
        <button onClick={() => setTab("deletions")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "deletions" ? "bg-blue-600 text-white" : "text-slate-600"}`}>Account deletions</button>
      </div>
      {tab === "services" ? <ServiceReqs /> : <DeletionReqs />}
    </div>
  );
}

function ServiceReqs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "service-requests", status],
    queryFn: () => api<{ requests: ServiceReq[] }>(`/api/admin/account/service-requests`, { params: { status } }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/admin/account/service-requests/${id}/approve`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast({ title: "Approved" }); },
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`/api/admin/account/service-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast({ title: "Rejected" }); },
  });
  const items = data?.requests ?? [];
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${status === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s}</button>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> :
          items.length === 0 ? <div className="text-center py-16 text-slate-500">No {status} requests.</div> :
          items.map((r) => (
            <div key={r.id} className="border-b border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{r.serviceName}</h3>
                    <span className="text-xs text-slate-500">by {r.providerName || r.providerId.slice(0, 8)}</span>
                    {r.providerPhone && <span className="text-xs text-slate-400">{r.providerPhone}</span>}
                  </div>
                  {r.note && <p className="text-sm text-slate-600 mt-1">{r.note}</p>}
                  {Array.isArray(r.documents) && r.documents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.documents.map((d, i) => (
                        <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline border border-blue-100 bg-blue-50 px-2 py-1 rounded">
                          <ExternalLink size={11} /> {d.label || d.type || `Doc ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => approve.mutate(r.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200"><CheckCircle2 size={14} /> Approve</button>
                    <button onClick={() => { const reason = prompt("Reason?") ?? ""; if (reason.trim()) reject.mutate({ id: r.id, reason }); }} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200"><XCircle size={14} /> Reject</button>
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function DeletionReqs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<"pending" | "cancelled" | "completed">("pending");
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "deletion-requests", status],
    queryFn: () => api<{ requests: DeletionReq[] }>(`/api/admin/account/deletion-requests`, { params: { status } }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/admin/account/deletion-requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast({ title: "Cancelled — account restored" }); },
  });
  const items = data?.requests ?? [];
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(["pending", "cancelled", "completed"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${status === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s}</button>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> :
          items.length === 0 ? <div className="text-center py-16 text-slate-500">No {status} requests.</div> :
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Scheduled delete</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => {
                const days = Math.max(0, Math.ceil((+new Date(r.scheduledDeleteAt) - Date.now()) / 86400000));
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 text-sm">{r.userName || "Unknown"}</div>
                      {r.userPhone && <div className="text-xs text-slate-500">{r.userPhone}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{r.reason || <span className="text-slate-400 italic">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">{new Date(r.scheduledDeleteAt).toLocaleDateString()}</div>
                      {r.status === "pending" && <div className="text-xs text-amber-600">{days} day{days === 1 ? "" : "s"} left</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" && (
                        confirmRestoreId === r.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => { cancel.mutate(r.id); setConfirmRestoreId(null); }} className="px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Restore</button>
                            <button onClick={() => setConfirmRestoreId(null)} className="px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmRestoreId(r.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200">
                            Restore
                          </button>
                        )
                      )}
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

