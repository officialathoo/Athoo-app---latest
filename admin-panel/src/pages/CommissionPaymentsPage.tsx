import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Filter } from "lucide-react";
import { StorageImage } from "@/components/ui/StorageImage";
import { getPrivateFileAccessUrl } from "@/lib/storage";

type Payment = {
  id: string;
  providerId: string;
  providerName: string | null;
  providerPhone: string | null;
  amount: number;
  accountId: string | null;
  reference: string | null;
  screenshotUrl: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
};

const STATUSES = ["pending", "approved", "rejected"] as const;

export function CommissionPaymentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<typeof STATUSES[number]>("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", "commission", status],
    queryFn: () => api<{ payments: Payment[] }>(`/api/admin/payments/commission`, { params: { status } }),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/admin/payments/commission/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      toast({ title: "Approved", description: "Provider commission balance was updated." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/api/admin/payments/commission/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      setRejectingId(null); setReason("");
      toast({ title: "Rejected" });
    },
  });

  const items = data?.payments ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Commission Payments</h1>
          <p className="text-sm text-slate-500">Review provider payment screenshots and approve to clear pending commission.</p>
        </div>
        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${status === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">No {status} payments.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Screenshot</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 text-sm">{p.providerName || "Unknown"}</div>
                    {p.providerPhone && <div className="text-xs text-slate-500">{p.providerPhone}</div>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">Rs {p.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-700">{p.reference || <span className="text-slate-400 italic">—</span>}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(p.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {p.screenshotUrl ? (
                      <button type="button" onClick={async () => { const url = await getPrivateFileAccessUrl(p.screenshotUrl!); window.open(url, "_blank", "noopener,noreferrer"); }} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                        <ExternalLink size={12} /> View
                      </button>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "pending" ? (
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => approve.mutate(p.id)}
                          disabled={approve.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 rounded"
                        >
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button
                          onClick={() => { setRejectingId(p.id); setReason(""); }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {p.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejectingId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRejectingId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">Reject payment</h3>
            <p className="text-sm text-slate-500 mt-1">Please provide a clear reason — this is shown to the provider.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-3 w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[80px] focus:outline-none focus:border-blue-500"
              placeholder="e.g. screenshot is not clear / amount mismatch"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectingId(null)} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => reject.mutate({ id: rejectingId!, reason })}
                disabled={reject.isPending || !reason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

