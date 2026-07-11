import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, currency, formatDate } from "@/lib/api";
import { TrendingUp, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type RateRequest = {
  id: string;
  providerId: string;
  providerName: string;
  service: string;
  currentRate?: number;
  requestedRate: number;
  reason?: string;
  status: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

export function RateRequestsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState<RateRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rate-requests", statusFilter],
    queryFn: () => api<{ requests: RateRequest[] }>("/api/admin/rate-requests"),
    staleTime: 30000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: string; status: string; reviewNote: string }) =>
      api(`/api/admin/rate-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status, reviewNote }) }),
    onSuccess: () => {
      toast({ title: "Rate request updated" });
      qc.invalidateQueries({ queryKey: ["rate-requests"] });
      setSelected(null);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const allRequests = data?.requests ?? [];
  const requests = allRequests.filter(r => statusFilter === "all" ? true : r.status === statusFilter);
  const pendingCount = allRequests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Rate Change Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">Providers requesting hourly rate adjustments</p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full border border-amber-200">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "pending", "approved", "rejected"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading requests…
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <TrendingUp size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No {statusFilter !== "all" ? statusFilter : ""} rate requests</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Current</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Change</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map(r => {
                const diff = r.currentRate ? r.requestedRate - r.currentRate : null;
                const diffPct = r.currentRate ? Math.round((diff! / r.currentRate) * 100) : null;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.providerName}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.service}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {r.currentRate ? currency(r.currentRate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {currency(r.requestedRate)}/hr
                    </td>
                    <td className="px-4 py-3 text-right">
                      {diff != null && (
                        <span className={`text-xs font-bold ${diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {diff > 0 ? "+" : ""}{diffPct}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status] || ""}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      {r.status === "pending" && (
                        <button
                          onClick={() => { setSelected(r); setReviewNote(""); }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Review Rate Request</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Provider</span>
                  <span className="text-sm font-medium text-slate-800">{selected.providerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Service</span>
                  <span className="text-sm font-medium text-slate-800">{selected.service}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Current Rate</span>
                  <span className="text-sm text-slate-600">{selected.currentRate ? currency(selected.currentRate) + "/hr" : "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Requested Rate</span>
                  <span className="text-sm font-bold text-blue-700">{currency(selected.requestedRate)}/hr</span>
                </div>
                {selected.reason && (
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Reason</p>
                    <p className="text-sm text-slate-700">{selected.reason}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Review Note (optional)</label>
                <textarea
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Explain your decision…"
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={() => reviewMutation.mutate({ id: selected.id, status: "rejected", reviewNote })}
                disabled={reviewMutation.isPending}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                Reject
              </button>
              <button
                onClick={() => reviewMutation.mutate({ id: selected.id, status: "approved", reviewNote })}
                disabled={reviewMutation.isPending}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
