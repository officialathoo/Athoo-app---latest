import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatDate } from "@/lib/api";
import { Flag, Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type ReportIssue = {
  id: string;
  bookingId?: string;
  reporterName: string;
  reporterRole: string;
  reportedName?: string;
  category: string;
  description: string;
  status: string;
  adminNote?: string;
  resolvedAt?: string;
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  under_review: "bg-amber-100 text-amber-700 border-amber-200",
  resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  dismissed: "bg-slate-100 text-slate-600 border-slate-200",
};

const CATEGORY_STYLE: Record<string, string> = {
  fraud: "bg-red-50 text-red-700",
  behavior: "bg-orange-50 text-orange-700",
  quality: "bg-amber-50 text-amber-700",
  payment: "bg-purple-50 text-purple-700",
  other: "bg-slate-50 text-slate-600",
};

export function ReportedIssuesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");
  const [selected, setSelected] = useState<ReportIssue | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["report-issues", statusFilter],
    queryFn: () => api<{ reports: ReportIssue[] }>(`/api/admin/report-issues${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
    staleTime: 30000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: string; adminNote: string }) =>
      api(`/api/admin/report-issues/${id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote }) }),
    onSuccess: () => {
      toast({ title: "Report updated successfully" });
      qc.invalidateQueries({ queryKey: ["report-issues"] });
      setSelected(null);
    },
    onError: () => toast({ title: "Failed to update report", variant: "destructive" }),
  });

  const reports = data?.reports ?? [];
  const openCount = reports.filter(r => r.status === "open").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reported Issues</h1>
          <p className="text-sm text-slate-500 mt-0.5">Customer and provider issue reports</p>
        </div>
        {openCount > 0 && (
          <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full border border-red-200">
            {openCount} open
          </span>
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "under_review", "resolved", "dismissed"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "under_review" ? "Under Review" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Reports list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading reports…
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCircle size={36} className="mx-auto text-emerald-300 mb-3" />
          <p className="text-slate-500 font-medium">No {statusFilter !== "all" ? statusFilter.replace("_", " ") : ""} reports</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => { setSelected(r); setAdminNote(r.adminNote || ""); setNewStatus(r.status); }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status] || "bg-slate-100 text-slate-600"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLE[r.category] || "bg-slate-50 text-slate-600"}`}>
                      {r.category}
                    </span>
                    {r.bookingId && (
                      <span className="text-xs text-slate-400 font-mono">Booking #{r.bookingId.slice(-6)}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800 font-medium line-clamp-2">{r.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>
                      By <span className="font-medium text-slate-700">{r.reporterName}</span>{" "}
                      <span className={`px-1.5 py-0.5 rounded text-xs ${r.reporterRole === "customer" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                        {r.reporterRole}
                      </span>
                    </span>
                    {r.reportedName && <span>Against: <span className="font-medium">{r.reportedName}</span></span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">{formatDate(r.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Review Report</h2>
              <p className="text-xs text-slate-500 mt-0.5">#{selected.id.slice(-8)}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_STYLE[selected.category] || ""}`}>
                    {selected.category}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${selected.reporterRole === "customer" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                    {selected.reporterRole}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{selected.description}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Reported by <strong>{selected.reporterName}</strong>
                  {selected.reportedName && <> against <strong>{selected.reportedName}</strong></>}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Update Status</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="open">Open</option>
                  <option value="under_review">Under Review</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Note</label>
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Add a note about your decision…"
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={() => reviewMutation.mutate({ id: selected.id, status: newStatus, adminNote })}
                disabled={reviewMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {reviewMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
