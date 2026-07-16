import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, currency, formatDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Wallet, RefreshCw, Check, X, Loader2, Search, CreditCard } from "lucide-react";

interface Withdrawal {
  id: string;
  providerId: string;
  amount: number;
  accountTitle: string;
  accountNumber: string;
  bankName: string | null;
  iban: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionNote: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  provider?: { id: string; name: string; phone: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export function WithdrawalsPage() {
  const focusId = new URLSearchParams(window.location.search).get("focus") || "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [payRef, setPayRef] = useState("");
  const [focusOpened, setFocusOpened] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "withdrawals"],
    queryFn: () => api<{ withdrawals: Withdrawal[] }>("/api/admin/withdrawals"),
    refetchInterval: 180000,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action, note, ref }: { id: string; action: string; note?: string; ref?: string }) =>
      api(`/api/admin/withdrawals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, note, paymentReference: ref }),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
      toast({ title: `Withdrawal ${vars.action}d`, description: "Provider notified." });
      setSelected(null);
      setActionNote("");
      setPayRef("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const withdrawals = data?.withdrawals ?? [];
  useEffect(() => {
    if (!focusId || focusOpened || withdrawals.length === 0) return;
    const focused = withdrawals.find((withdrawal) => withdrawal.id === focusId);
    if (!focused) return;
    setStatusFilter(focused.status);
    setSelected(focused);
    setActionNote(focused.rejectionNote || focused.note || "");
    setPayRef(focused.paymentReference || "");
    setFocusOpened(true);
  }, [focusId, focusOpened, withdrawals]);
  const filtered = withdrawals.filter((w) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (w.provider?.name || "").toLowerCase().includes(q) ||
      (w.provider?.phone || "").includes(q) ||
      w.accountTitle.toLowerCase().includes(q) ||
      w.accountNumber.includes(q);
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pending = withdrawals.filter((w) => w.status === "pending").length;
  const approved = withdrawals.filter((w) => w.status === "approved").length;
  const totalPaid = withdrawals.filter((w) => w.status === "paid").reduce((s, w) => s + w.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Withdrawal Requests</h1>
        <p className="text-sm text-slate-500 mt-1">Review and process provider earnings withdrawal requests</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-amber-800 mt-1">{pending}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Approved</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{approved}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{currency(totalPaid)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by provider name, phone, account..."
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
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] })}
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
            <Wallet size={32} className="opacity-40" />
            <p className="text-sm">No withdrawal requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((w) => (
                  <tr key={w.id} data-focus-id={w.id === focusId ? w.id : undefined} className={w.id === focusId ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50/50 transition-colors"}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800">{w.provider?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{w.provider?.phone || "—"}</p>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{currency(w.amount)}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-700">{w.accountTitle}</p>
                      <p className="text-xs text-slate-500">{w.bankName ? `${w.bankName} · ` : ""}{w.accountNumber}</p>
                      {w.iban && <p className="text-xs text-slate-400">{w.iban}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[w.status]}`}>
                        {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{formatDate(w.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => { setSelected(w); setActionNote(""); setPayRef(w.paymentReference || ""); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {w.status === "pending" ? "Review" : "View"}
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
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <CreditCard size={20} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Withdrawal Request</h3>
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
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider</p>
                  <p className="font-medium text-slate-800 mt-1">{selected.provider?.name || "—"}</p>
                  <p className="text-sm text-slate-500">{selected.provider?.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{currency(selected.amount)}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Details</p>
                <div className="flex justify-between"><span className="text-sm text-slate-600">Title</span><span className="text-sm font-medium text-slate-800">{selected.accountTitle}</span></div>
                <div className="flex justify-between"><span className="text-sm text-slate-600">Number</span><span className="text-sm font-medium text-slate-800">{selected.accountNumber}</span></div>
                {selected.bankName && <div className="flex justify-between"><span className="text-sm text-slate-600">Bank</span><span className="text-sm font-medium text-slate-800">{selected.bankName}</span></div>}
                {selected.iban && <div className="flex justify-between"><span className="text-sm text-slate-600">IBAN</span><span className="text-sm font-mono text-xs text-slate-800">{selected.iban}</span></div>}
              </div>
              {selected.note && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-700">Provider Note</p>
                  <p className="text-sm text-amber-800 mt-1">{selected.note}</p>
                </div>
              )}
              {selected.status === "rejected" && selected.rejectionNote && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                  <p className="text-sm text-red-800 mt-1">{selected.rejectionNote}</p>
                </div>
              )}
              {(selected.status === "approved" || selected.status === "paid") && selected.paymentReference && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-emerald-700">Payment Reference</p>
                  <p className="text-sm text-emerald-800 mt-1 font-mono">{selected.paymentReference}</p>
                  {selected.paidAt && <p className="text-xs text-emerald-600 mt-1">Paid on {formatDate(selected.paidAt)}</p>}
                </div>
              )}

              {selected.status === "pending" && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment Reference (for approval)</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Transaction ID / reference number"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note (optional for approval, required for rejection)</label>
                    <textarea
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                      placeholder="Internal note or rejection reason..."
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      disabled={actionMut.isPending}
                      onClick={() => actionMut.mutate({ id: selected.id, action: "approve", note: actionNote || undefined, ref: payRef || undefined })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                    </button>
                    <button
                      disabled={actionMut.isPending || !actionNote.trim()}
                      onClick={() => actionMut.mutate({ id: selected.id, action: "reject", note: actionNote })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {actionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Reject
                    </button>
                  </div>
                </div>
              )}

              {selected.status === "approved" && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment Reference</label>
                    <input
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Transaction ID"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                    />
                  </div>
                  <button
                    disabled={actionMut.isPending}
                    onClick={() => actionMut.mutate({ id: selected.id, action: "paid", ref: payRef || undefined })}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {actionMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Mark as Paid
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
