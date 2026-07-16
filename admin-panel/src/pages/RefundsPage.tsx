import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, currency, formatDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, RefreshCw, Check, X, Loader2, Search } from "lucide-react";

interface Refund {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  reason: string;
  amountRequested: number;
  amountApproved: number | null;
  status: "pending" | "approved" | "rejected" | "paid";
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  createdAt: string;
  updatedAt: string;
  booking?: { id: string; service: string; price: number };
  customer?: { id: string; name: string; phone: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export function RefundsPage() {
  const focusId = new URLSearchParams(window.location.search).get("focus") || "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Refund | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [focusOpened, setFocusOpened] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "refunds"],
    queryFn: () => api<{ refunds: Refund[] }>("/api/admin/refunds"),
    refetchInterval: 180000,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action, note, paymentReference }: { id: string; action: string; note?: string; paymentReference?: string }) =>
      api(`/api/admin/refunds/${id}`, {
        method: "PATCH",
        body: { action, resolutionNote: note, paymentReference },
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "refunds"] });
      toast({ title: `Refund ${vars.action}d`, description: "Customer notified." });
      setSelected(null);
      setResolutionNote("");
      setPaymentReference("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const refunds = data?.refunds ?? [];
  useEffect(() => {
    if (!focusId || focusOpened || refunds.length === 0) return;
    const focused = refunds.find((refund) => refund.id === focusId);
    if (!focused) return;
    setStatusFilter(focused.status);
    setSelected(focused);
    setResolutionNote(focused.resolutionNote || "");
    setPaymentReference(focused.paymentReference || "");
    setFocusOpened(true);
  }, [focusId, focusOpened, refunds]);
  const filtered = refunds.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (r.customer?.name || "").toLowerCase().includes(q) ||
      (r.customer?.phone || "").includes(q) ||
      (r.booking?.service || "").toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pending = refunds.filter((r) => r.status === "pending").length;
  const totalPaid = refunds.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.amountRequested, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Refund Requests</h1>
        <p className="text-sm text-slate-500 mt-1">Review and process customer refund requests</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{pending}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{currency(totalPaid)}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Requests</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{refunds.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by customer, service, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
          </select>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "refunds"] })}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={22} className="animate-spin mr-2" /> Loading…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600 bg-red-50">{(error as Error).message}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400 gap-2">
            <RotateCcw size={32} className="opacity-40" />
            <p className="text-sm">No refund requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} data-focus-id={r.id === focusId ? r.id : undefined} className={r.id === focusId ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50/50 transition-colors"}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800">{r.customer?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{r.customer?.phone || "—"}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-700">{r.booking?.service || "—"}</p>
                      <p className="text-xs text-slate-400">Booking price: {currency(r.booking?.price || 0)}</p>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{currency(r.amountRequested)}</td>
                    <td className="px-5 py-3.5 max-w-xs">
                      <p className="text-sm text-slate-600 truncate">{r.reason}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[r.status]}`}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => { setSelected(r); setResolutionNote("");
      setPaymentReference(""); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {r.status === "pending" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <RotateCcw size={20} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Refund Request</h3>
                  <p className="text-xs text-slate-500">{formatDate(selected.createdAt)}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</p>
                  <p className="font-medium text-slate-800 mt-1">{selected.customer?.name || "—"}</p>
                  <p className="text-sm text-slate-500">{selected.customer?.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested Amount</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{currency(selected.amountRequested)}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking</p>
                <p className="text-sm font-medium text-slate-700">{selected.booking?.service || "—"}</p>
                <p className="text-xs text-slate-500">Booking price: {currency(selected.booking?.price || 0)}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Customer's Reason</p>
                <p className="text-sm text-amber-900">{selected.reason}</p>
              </div>
              {selected.resolutionNote && (
                <div className={`border rounded-xl p-4 ${selected.status === "rejected" ? "bg-red-50 border-red-200" : selected.status === "paid" ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-200"}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${selected.status === "rejected" ? "text-red-700" : selected.status === "paid" ? "text-emerald-700" : "text-blue-700"}`}>
                    Resolution Note
                  </p>
                  <p className={`text-sm ${selected.status === "rejected" ? "text-red-900" : selected.status === "paid" ? "text-emerald-900" : "text-blue-900"}`}>{selected.resolutionNote}</p>
                  {selected.paymentReference && <p className="text-xs mt-2 font-mono">Payment ref: {selected.paymentReference}</p>}
                  {selected.resolvedAt && <p className="text-xs mt-1 opacity-70">Resolved: {formatDate(selected.resolvedAt)}</p>}
                </div>
              )}

              {selected.status === "approved" && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Approval records the decision only. Mark paid after the manual transfer is completed.</div>
                  <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" placeholder="Payment reference / transaction ID" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
                  <textarea className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none" rows={2} placeholder="Payout note" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
                  <button disabled={actionMut.isPending || paymentReference.trim().length < 3 || resolutionNote.trim().length < 5} onClick={() => actionMut.mutate({ id: selected.id, action: "paid", note: resolutionNote, paymentReference })} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Mark Refund Paid</button>
                </div>
              )}

              {selected.status === "pending" && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resolution Note</label>
                    <textarea
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={3}
                      placeholder="Explain the decision to the customer..."
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      disabled={actionMut.isPending || resolutionNote.trim().length < 5}
                      onClick={() => actionMut.mutate({ id: selected.id, action: "approve", note: resolutionNote })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve Refund
                    </button>
                    <button
                      disabled={actionMut.isPending || !resolutionNote.trim()}
                      onClick={() => actionMut.mutate({ id: selected.id, action: "reject", note: resolutionNote })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
