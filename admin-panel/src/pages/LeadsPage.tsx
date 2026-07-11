import { useEffect, useState, useMemo } from "react";
import { api, formatDate } from "@/lib/api";
import {
  Search, RefreshCw, Download, X, ChevronLeft, ChevronRight,
  CheckCircle, Mail, Phone, MessageSquare, Tag, User, Loader2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/hooks/use-toast";

interface Lead {
  id: string;
  type: "customer" | "provider" | "contact";
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  service: string | null;
  city: string | null;
  source: string;
  status: string;
  contactedAt: string | null;
  notes: string | null;
  isDuplicate: boolean;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "not_interested", label: "Not Interested" },
  { value: "duplicate", label: "Duplicate" },
  { value: "archived", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "customer", label: "Customer" },
  { value: "provider", label: "Provider" },
  { value: "contact", label: "Contact" },
];

const PAGE_SIZE = 30;

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-800",
  converted: "bg-emerald-100 text-emerald-700",
  not_interested: "bg-slate-100 text-slate-600",
  duplicate: "bg-red-100 text-red-700",
  archived: "bg-slate-100 text-slate-400",
};

export function LeadsPage() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ leads: Lead[]; total: number }>("/api/admin/leads?limit=2000");
      setLeads(res.leads);
    } catch {
      toast({ title: "Error", description: "Failed to load leads", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (q && !l.name.toLowerCase().includes(q) && !l.phone.includes(q) && !(l.email || "").toLowerCase().includes(q) && !(l.message || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleStatusUpdate(leadId: string, status: string) {
    setUpdatingStatus(true);
    try {
      const res = await api<{ lead: Lead }>(`/api/admin/leads/${leadId}/status`, {
        method: "PATCH",
        body: { status },
      });
      setLeads(prev => prev.map(l => l.id === res.lead.id ? res.lead : l));
      setSelected(res.lead);
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to update", variant: "destructive" });
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSaveNotes(leadId: string) {
    setSavingNotes(true);
    try {
      const res = await api<{ lead: Lead }>(`/api/admin/leads/${leadId}/notes`, {
        method: "PATCH",
        body: { notes: notesInput },
      });
      setLeads(prev => prev.map(l => l.id === res.lead.id ? res.lead : l));
      setSelected(res.lead);
      toast({ title: "Notes saved" });
    } catch {
      toast({ title: "Error", description: "Failed to save notes", variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const base = import.meta.env.VITE_API_BASE_URL || "";
      const token = localStorage.getItem("athoo_admin_token") || "";
      const res = await fetch(`${base}/api/admin/leads/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `athoo-leads-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const counts = useMemo(() => ({
    new: leads.filter(l => l.status === "new").length,
    contacted: leads.filter(l => l.status === "contacted").length,
    converted: leads.filter(l => l.status === "converted").length,
    duplicates: leads.filter(l => l.isDuplicate).length,
  }), [leads]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads & Waitlist</h1>
          <p className="text-sm text-slate-500 mt-0.5">Website enquiries, provider applications, and customer waitlist</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export CSV
        </button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "New", value: counts.new, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Contacted", value: counts.contacted, color: "text-amber-700", bg: "bg-amber-50" },
          { label: "Converted", value: counts.converted, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Duplicates", value: counts.duplicates, color: "text-red-700", bg: "bg-red-50" },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4`}>
            <p className="text-xs font-medium text-slate-500 mb-1">{m.label}</p>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search name, phone, email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <RefreshCw size={15} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading leads…
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No leads found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Name", "Type", "Phone / Email", "City", "Status", "Source", "Created"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(lead => (
                  <tr
                    key={lead.id}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                    onClick={() => { setSelected(lead); setNotesInput(lead.notes || ""); }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{lead.name}</span>
                        {lead.isDuplicate && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">DUP</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${lead.type === "provider" ? "bg-purple-100 text-purple-700" : lead.type === "customer" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                        {lead.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{lead.phone}</div>
                      {lead.email && <div className="text-xs text-slate-400">{lead.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{lead.city || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[lead.status] || "bg-slate-100 text-slate-600"}`}>
                        {lead.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{lead.source}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(lead.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <span>{filtered.length} leads</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Lead detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-900">{selected.name}</h3>
                  {selected.isDuplicate && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Duplicate</span>}
                </div>
                <p className="text-xs text-slate-400 capitalize">{selected.type} lead · {selected.source}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Phone", selected.phone],
                  ["Email", selected.email || "—"],
                  ["City", selected.city || "—"],
                  ["Service", selected.service || "—"],
                  ["Submitted", formatDate(selected.createdAt)],
                  ["Contacted", selected.contactedAt ? formatDate(selected.contactedAt) : "—"],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="text-sm font-medium text-slate-800 break-words">{String(val)}</p>
                  </div>
                ))}
              </div>

              {selected.message && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-400 mb-1">Message</p>
                  <p className="text-sm text-slate-700">{selected.message}</p>
                </div>
              )}

              {/* Status changer */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.filter(s => s.value !== "all").map(s => (
                    <button
                      key={s.value}
                      disabled={updatingStatus || selected.status === s.value}
                      onClick={() => handleStatusUpdate(selected.id, s.value)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${selected.status === s.value ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Internal Notes</p>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  placeholder="Add internal notes about this lead…"
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                />
                <button
                  onClick={() => handleSaveNotes(selected.id)}
                  disabled={savingNotes}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingNotes ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  Save Notes
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                    <Phone size={14} /> Call
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 text-sm px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                    <Mail size={14} /> Email
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
