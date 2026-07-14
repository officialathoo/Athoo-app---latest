import { useState } from "react";
import { api, formatDate } from "@/lib/api";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, RefreshCw, MessageSquare, AlertTriangle, CheckCircle,
  Clock, Send, Loader2, ChevronRight, StickyNote, X, User
} from "lucide-react";

interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userRole?: string;
  category?: string;
  subject: string;
  description?: string;
  message?: string;
  bookingId?: string | null;
  relatedBookingId?: string | null;
  status: string;
  priority: string;
  assignedToName?: string | null;
  adminNotes?: string | null;
  resolutionNote?: string | null;
  mediaUrls?: string[] | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketNote {
  id: string;
  ticketId: string;
  adminId: string;
  adminName: string;
  note: string;
  isInternal: boolean;
  createdAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  normal: "text-blue-600 bg-blue-50 border-blue-200",
  low: "text-slate-600 bg-slate-50 border-slate-200",
};

function timeAgo(date: string) {
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  const h = Math.floor(d / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ComplaintsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteInternal, setNoteInternal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [showResolution, setShowResolution] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-tickets", statusFilter, priorityFilter],
    queryFn: () => api<{ tickets: SupportTicket[] }>("/api/admin/support"),
    refetchInterval: 180000,
  });

  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ["ticket-notes", selected?.id],
    queryFn: () => selected ? api<{ notes: TicketNote[] }>(`/api/admin/support/${selected.id}/notes`) : Promise.resolve({ notes: [] }),
    enabled: !!selected,
    staleTime: 10000,
  });

  const addNoteMut = useMutation({
    mutationFn: ({ ticketId, note, isInternal }: { ticketId: string; note: string; isInternal: boolean }) =>
      api(`/api/admin/support/${ticketId}/notes`, { method: "POST", body: JSON.stringify({ note, isInternal }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-notes", selected?.id] });
      setNewNote("");
    },
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ ticketId, status, resolutionNote }: { ticketId: string; status: string; resolutionNote?: string }) =>
      api(`/api/admin/support/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ status, resolutionNote }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      if (selected) setSelected(s => s ? { ...s, status: vars.status, resolutionNote: vars.resolutionNote } : null);
      setShowResolution(false);
      setResolutionNote("");
    },
  });

  const updatePriorityMut = useMutation({
    mutationFn: ({ ticketId, priority }: { ticketId: string; priority: string }) =>
      api(`/api/admin/support/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ priority }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });

  const tickets = data?.tickets || [];
  const notes = notesData?.notes || [];

  const filtered = tickets.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.userName.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const openCount = tickets.filter(t => t.status === "open").length;
  const urgentCount = tickets.filter(t => t.priority === "urgent" && t.status !== "resolved" && t.status !== "closed").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;

  function handleStatusChange(status: string) {
    if (!selected) return;
    if (status === "resolved" && !resolutionNote.trim()) {
      setShowResolution(true);
      return;
    }
    updateStatusMut.mutate({ ticketId: selected.id, status, resolutionNote: resolutionNote || undefined });
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open Tickets" value={openCount} icon={MessageSquare} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatCard label="In Progress" value={inProgressCount} icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" />
        <StatCard label="Urgent" value={urgentCount} icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
        <StatCard label="Resolved" value={resolvedCount} icon={CheckCircle} iconColor="text-green-600" iconBg="bg-green-50" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by name, subject..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <button onClick={() => refetch()} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        <DataTable
          data={filtered}
          loading={isLoading}
          keyExtractor={t => t.id}
          emptyMessage="No support tickets found."
          columns={[
            {
              header: "Ticket",
              render: t => (
                <div>
                  <p className="font-medium text-slate-800 text-sm">{t.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.description || t.message}</p>
                </div>
              ),
            },
            {
              header: "User",
              render: t => (
                <div>
                  <p className="text-sm font-medium text-slate-700">{t.userName}</p>
                  <p className="text-xs text-slate-400">{t.userPhone}</p>
                </div>
              ),
            },
            {
              header: "Priority",
              render: t => (
                <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize border ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normal}`}>
                  {t.priority}
                </span>
              ),
            },
            {
              header: "Status",
              render: t => <StatusBadge status={t.status} />,
            },
            {
              header: "Submitted",
              render: t => (
                <div>
                  <p className="text-xs text-slate-500">{timeAgo(t.createdAt)}</p>
                  <p className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
              ),
            },
            {
              header: "",
              render: t => (
                <button
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  onClick={() => { setSelected(t); setShowResolution(false); setResolutionNote(""); }}
                >
                  Manage <ChevronRight size={12} />
                </button>
              ),
            },
          ]}
        />
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusBadge status={selected.status} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${PRIORITY_COLORS[selected.priority] || PRIORITY_COLORS.normal}`}>
                    {selected.priority}
                  </span>
                  {selected.category && (
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 capitalize">{selected.category}</span>
                  )}
                </div>
                <h3 className="font-semibold text-slate-800 text-base">{selected.subject}</h3>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                  <User size={11} /> {selected.userName} · {selected.userPhone}
                  {selected.assignedToName && <span className="ml-2">· Assigned to {selected.assignedToName}</span>}
                </p>
              </div>
              <button onClick={() => { setSelected(null); setShowResolution(false); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Description</p>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl leading-relaxed">
                  {selected.description || selected.message || "No description provided."}
                </p>
              </div>


              {selected.mediaUrls && selected.mediaUrls.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Attached Media</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selected.mediaUrls.map((url, i) => (
                      <a key={url + i} href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-xl p-3 hover:bg-blue-100">
                        Open attachment {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selected.relatedBookingId || selected.bookingId ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3" data-testid="admin-support-booking-context">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Booking-linked case</p>
                  <p className="text-xs text-blue-700 font-mono">{selected.relatedBookingId || selected.bookingId}</p>
                  <p className="text-xs text-blue-600 mt-2">Review the booking timeline, chat history, payment state, and uploaded evidence before resolving this ticket.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3" data-testid="admin-support-no-booking-context">
                  <p className="text-xs font-semibold text-amber-700">No booking linked</p>
                  <p className="text-xs text-amber-600 mt-1">Confirm the affected booking with the user before making a service-quality or finance decision.</p>
                </div>
              )}

              {selected.resolutionNote && (
                <div>
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Resolution Note</p>
                  <p className="text-sm text-slate-700 bg-green-50 border border-green-100 p-3 rounded-xl">
                    {selected.resolutionNote}
                  </p>
                  {selected.resolvedAt && (
                    <p className="text-xs text-slate-400 mt-1">Resolved {formatDate(selected.resolvedAt)}</p>
                  )}
                </div>
              )}

              {/* Priority change */}
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Change Priority:</p>
                <div className="flex gap-1.5">
                  {["urgent", "high", "normal", "low"].map(p => (
                    <button
                      key={p}
                      onClick={() => updatePriorityMut.mutate({ ticketId: selected.id, priority: p })}
                      disabled={selected.priority === p}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize transition-colors ${
                        selected.priority === p ? PRIORITY_COLORS[p] : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      } disabled:cursor-not-allowed`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes thread */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <StickyNote size={14} className="text-slate-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Internal Notes</p>
                  <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{notes.length}</span>
                </div>

                {notesLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                    <Loader2 size={14} className="animate-spin" /> Loading notes…
                  </div>
                ) : notes.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No notes yet. Add the first one below.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {notes.map(n => (
                      <div key={n.id} className={`rounded-xl p-3 text-sm ${n.isInternal ? "bg-amber-50 border border-amber-100" : "bg-blue-50 border border-blue-100"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700 text-xs">{n.adminName}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${n.isInternal ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                              {n.isInternal ? "Internal" : "Reply"}
                            </span>
                            <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                          </div>
                        </div>
                        <p className="text-slate-700 leading-relaxed">{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add note */}
                <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                  <textarea
                    className="w-full text-sm p-3 focus:outline-none resize-none"
                    rows={3}
                    placeholder="Add a note or reply to user..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                  />
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noteInternal}
                        onChange={e => setNoteInternal(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300"
                      />
                      Internal only (not visible to user)
                    </label>
                    <button
                      onClick={() => { if (newNote.trim() && selected) addNoteMut.mutate({ ticketId: selected.id, note: newNote, isInternal: noteInternal }); }}
                      disabled={!newNote.trim() || addNoteMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {addNoteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Send Note
                    </button>
                  </div>
                </div>
              </div>

              {/* Resolution note input (when resolving) */}
              {showResolution && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-green-800">Add a resolution note (required)</p>
                  <textarea
                    className="w-full text-sm border border-green-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white resize-none"
                    rows={3}
                    placeholder="Describe how this ticket was resolved..."
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowResolution(false)} className="flex-1 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                      Cancel
                    </button>
                    <button
                      onClick={() => updateStatusMut.mutate({ ticketId: selected.id, status: "resolved", resolutionNote })}
                      disabled={!resolutionNote.trim() || updateStatusMut.isPending}
                      className="flex-1 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {updateStatusMut.isPending && <Loader2 size={13} className="animate-spin" />}
                      Confirm Resolution
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {!showResolution && (
                <div className="flex gap-2 flex-wrap border-t border-slate-100 pt-4">
                  {selected.status === "open" && (
                    <button
                      disabled={updateStatusMut.isPending}
                      onClick={() => handleStatusChange("in_progress")}
                      className="flex-1 min-w-[120px] py-2 text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
                    >
                      Mark In Progress
                    </button>
                  )}
                  {selected.status !== "resolved" && selected.status !== "closed" && (
                    <button
                      disabled={updateStatusMut.isPending}
                      onClick={() => handleStatusChange("resolved")}
                      className="flex-1 min-w-[120px] py-2 text-sm font-medium bg-green-50 text-green-700 border border-green-200 rounded-xl hover:bg-green-100 transition-colors"
                    >
                      {updateStatusMut.isPending ? <Loader2 size={13} className="animate-spin mx-auto" /> : "Mark Resolved"}
                    </button>
                  )}
                  {selected.status !== "closed" && (
                    <button
                      disabled={updateStatusMut.isPending}
                      onClick={() => handleStatusChange("closed")}
                      className="flex-1 min-w-[100px] py-2 text-sm font-medium bg-slate-100 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Close
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

