import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { RefreshCw, Search, XCircle } from "lucide-react";

interface NegotiationRow {
  id: string;
  customerName: string;
  providerName: string;
  service: string;
  customerOffer: number;
  providerCounter?: number | null;
  finalPrice?: number | null;
  status: string;
  expiresAt?: string | null;
  createdAt?: string | null;
}

export function NegotiationsPage() {
  const [rows, setRows] = useState<NegotiationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      const res = await api<{ negotiations: NegotiationRow[] }>(`/api/admin/negotiations?${params}`);
      setRows(res.negotiations || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [status]);

  const activeCount = useMemo(() => rows.filter((r) => ["customer_offer", "provider_counter"].includes(r.status)).length, [rows]);

  async function closeNegotiation(row: NegotiationRow) {
    const reason = window.prompt("Reason for closing this negotiation:");
    if (!reason?.trim()) return;
    await api(`/api/admin/negotiations/${row.id}/close`, { method: "PATCH", body: { reason: reason.trim() } });
    await load();
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader eyebrow="Operations" title="Negotiations" description="Review active offers and close stuck or unsafe negotiations without changing an agreed price." />
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-bold">{rows.length}</div><div className="text-xs text-slate-500">Loaded</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-bold text-amber-600">{activeCount}</div><div className="text-xs text-slate-500">Active</div></div>
      </div>
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><input className="w-full border rounded-lg pl-9 pr-3 py-2" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search customer, provider, service or ID" /></div>
          <select className="border rounded-lg px-3 py-2" value={status} onChange={(e)=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="customer_offer">Customer offer</option><option value="provider_counter">Provider counter</option><option value="accepted">Accepted</option><option value="rejected">Closed</option></select>
          <button onClick={load} className="border rounded-lg px-3 py-2 flex items-center gap-2"><RefreshCw size={15}/> Refresh</button>
        </div>
        {loading ? <div className="p-10 text-center text-slate-400">Loading negotiations…</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="text-left p-3">Service</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Provider</th><th className="text-left p-3">Offer</th><th className="text-left p-3">Status</th><th className="p-3"/></tr></thead><tbody className="divide-y">{rows.map((row)=><tr key={row.id}><td className="p-3"><div className="font-medium">{row.service}</div><div className="text-xs text-slate-400 font-mono">{row.id}</div></td><td className="p-3">{row.customerName}</td><td className="p-3">{row.providerName}</td><td className="p-3">Rs. {row.finalPrice ?? row.providerCounter ?? row.customerOffer}</td><td className="p-3 capitalize">{row.status.replace("_", " ")}</td><td className="p-3 text-right">{["customer_offer","provider_counter"].includes(row.status) && <button onClick={()=>closeNegotiation(row)} className="text-red-600 inline-flex items-center gap-1"><XCircle size={15}/> Close</button>}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
