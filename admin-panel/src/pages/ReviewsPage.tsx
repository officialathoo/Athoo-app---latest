import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Search, Star } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";

type ReviewRow = {
  id: string; bookingId: string; reviewerName: string; reviewedName: string;
  rating: number; review?: string | null; isDisputed: boolean; disputeNote?: string | null;
  createdAt?: string | null; service?: string | null;
};

export function ReviewsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const { toast } = useToast();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-reviews", q, status],
    queryFn: () => api<{ reviews: ReviewRow[] }>(`/api/admin/reviews?q=${encodeURIComponent(q)}&status=${status}`),
  });
  const moderation = useMutation({
    mutationFn: async ({ row, action }: { row: ReviewRow; action: "hide" | "restore" }) => {
      const note = action === "hide" ? window.prompt("Why should this review be hidden?")?.trim() : "";
      if (action === "hide" && !note) throw new Error("Moderation cancelled");
      return api(`/api/admin/reviews/${row.id}/moderation`, { method: "PATCH", body: { action, note } });
    },
    onSuccess: () => { toast({ title: "Review updated" }); qc.invalidateQueries({ queryKey: ["admin-reviews"] }); },
    onError: (error: Error) => error.message !== "Moderation cancelled" && toast({ title: error.message, variant: "destructive" }),
  });
  const rows = query.data?.reviews || [];

  return <div className="space-y-5" data-testid="reviews-moderation-page">
    <AdminPageHeader eyebrow="Trust & Quality" title="Review Moderation" description="Inspect verified booking reviews and hide content only when abuse, fraud, or policy violations are confirmed." />
    <div className="flex gap-3 bg-white border rounded-xl p-3">
      <div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search customer, provider, booking or review" className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"/></div>
      <select value={status} onChange={e=>setStatus(e.target.value)} className="border rounded-lg px-3 text-sm"><option value="all">All reviews</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select>
    </div>
    <div className="bg-white border rounded-xl overflow-hidden">
      {query.isLoading ? <p className="p-5 text-sm text-slate-500">Loading reviews…</p> : rows.length === 0 ? <p className="p-5 text-sm text-slate-500">No reviews found.</p> : <div className="divide-y">{rows.map(row => <div key={row.id} className="p-5 flex gap-4 items-start">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${row.isDisputed ? 'bg-amber-100' : 'bg-emerald-100'}`}><Star size={18} className={row.isDisputed ? 'text-amber-700' : 'text-emerald-700'}/></div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{row.reviewerName} → {row.reviewedName}</p><span className="text-xs rounded-full bg-slate-100 px-2 py-1">{row.rating}/5</span><span className="text-xs text-slate-400">{row.service || 'Service'} • {row.bookingId}</span></div>
          <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{row.review || "No written review"}</p>
          {row.isDisputed && row.disputeNote ? <p className="text-xs text-amber-700 mt-2">Hidden: {row.disputeNote}</p> : null}
          <p className="text-xs text-slate-400 mt-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}</p>
        </div>
        <button disabled={moderation.isPending} onClick={()=>moderation.mutate({row, action: row.isDisputed ? 'restore' : 'hide'})} className="border rounded-lg px-3 py-2 text-xs font-medium flex gap-2 items-center">{row.isDisputed ? <><Eye size={14}/>Restore</> : <><EyeOff size={14}/>Hide</>}</button>
      </div>)}</div>}
    </div>
  </div>;
}
