import { useEffect, useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import { getPrivateFileAccessUrl } from "@/lib/storage";
import { buildCsv } from "@/lib/csv";
import type { Booking } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BookingTimeline } from "@/components/BookingTimeline";
import { BookingOperationalSummary } from "@/components/BookingOperationalSummary";
import { Search, RefreshCw, Download, ChevronLeft, ChevronRight, X, Calendar, ShieldAlert, UserRoundCog } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import type { User } from "@/lib/types";

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active (Accepted + In Progress)" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STAT_CONFIG = [
  { label: "Total", key: "all", color: "text-slate-700", bg: "bg-slate-100" },
  { label: "Pending", key: "pending", color: "text-amber-700", bg: "bg-amber-100" },
  { label: "Active", key: "active", color: "text-blue-700", bg: "bg-blue-100" },
  { label: "Completed", key: "completed", color: "text-emerald-700", bg: "bg-emerald-100" },
  { label: "Cancelled", key: "cancelled", color: "text-red-700", bg: "bg-red-100" },
];

function today() {
  return new Date().toISOString().split("T")[0];
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

type BookingOperation = { id: string; adminName: string; action: string; reason: string; createdAt: string; fromProviderId?: string | null; toProviderId?: string | null };

function PrivateVideo({ objectPath }: { objectPath: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let active = true; getPrivateFileAccessUrl(objectPath).then((url) => { if (active) setSrc(url); }).catch(() => { if (active) setSrc(""); }); return () => { active = false; }; }, [objectPath]);
  return src ? <video src={src} controls preload="metadata" className="w-full rounded-lg max-h-64 bg-black" style={{ aspectRatio: "16/9" }} /> : <p className="text-xs text-slate-400">Loading protected video…</p>;
}

export function BookingsPage() {
  const focusId = new URLSearchParams(window.location.search).get("focus") || "";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [total, setTotal] = useState(0);
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [operations, setOperations] = useState<BookingOperation[]>([]);
  const [availableProviders, setAvailableProviders] = useState<User[]>([]);
  const [replacementProviderId, setReplacementProviderId] = useState("");
  const [operationLoading, setOperationLoading] = useState(false);
  const [focusOpened, setFocusOpened] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("bookings.write");
  const canExport = hasPermission("export.read");

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ bookings: Booking[]; total: number; counts: Record<string, number> }>("/api/admin/bookings", {
        params: {
          q: search.trim() || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          limit: PAGE_SIZE,
        },
      });
      setBookings(res.bookings || []);
      setTotal(Number(res.total || 0));
      setServerCounts(res.counts || {});
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [search, statusFilter, dateFrom, dateTo, page]);

  const filtered = bookings;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paged = bookings;

  function resetFilters() {
    setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); setPage(1);
  }

  function applyPreset(preset: string) {
    if (preset === "today") { setDateFrom(today()); setDateTo(today()); }
    else if (preset === "7d") { setDateFrom(daysAgo(7)); setDateTo(today()); }
    else if (preset === "30d") { setDateFrom(daysAgo(30)); setDateTo(today()); }
    setPage(1);
  }

  function exportCSV() {
    const rows = [["ID", "Customer", "Provider", "Service", "Date", "Time", "Status", "Payment", "Price"], ...bookings.map(b => [b.publicId || b.id, b.customerName, b.providerName, b.service, b.scheduledDate, b.scheduledTime, b.status, b.paymentStatus || "pending", b.price ?? ""])];
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bookings-page-${page}-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const counts = { all: Number(serverCounts.all || 0), pending: Number(serverCounts.pending || 0), active: Number(serverCounts.in_progress || 0) + Number(serverCounts.accepted || 0), completed: Number(serverCounts.completed || 0), cancelled: Number(serverCounts.cancelled || 0) };
  const totalRevenue = bookings.filter(b => b.status === "completed").reduce((sum, b) => sum + Number(b.price || 0), 0);

  async function openBooking(booking: Booking) {
    setSelected(booking); setOperations([]); setAvailableProviders([]); setReplacementProviderId("");
    try {
      const [details, providers] = await Promise.all([
        api<{ booking: Booking; operations: BookingOperation[] }>(`/api/admin/bookings/${booking.id}/operations`),
        canWrite && booking.status === "pending" ? api<{ providers: User[] }>("/api/admin/providers", { params: { status: "available", limit: 200 } }) : Promise.resolve({ providers: [] as User[] }),
      ]);
      setSelected(details.booking); setOperations(details.operations || []);
      setAvailableProviders((providers.providers || []).filter(provider => provider.id !== booking.providerId));
    } catch (error) { setLoadError((error as Error).message); }
  }

  useEffect(() => {
    if (!focusId || focusOpened || loading) return;
    setFocusOpened(true);
    const focused = bookings.find((booking) => booking.id === focusId || booking.publicId === focusId);
    if (focused) { void openBooking(focused); return; }
    api<{ booking: Booking; operations: BookingOperation[] }>(`/api/admin/bookings/${focusId}/operations`)
      .then(({ booking, operations: history }) => { setSelected(booking); setOperations(history || []); })
      .catch((error) => setLoadError(error.message || "Referenced booking could not be opened"));
  }, [bookings, focusId, focusOpened, loading]);

  async function cancelBooking() {
    if (!selected || operationLoading) return;
    const reason = window.prompt("Reason for cancelling this booking (minimum 10 characters):")?.trim();
    if (!reason) return;
    setOperationLoading(true);
    try {
      const res = await api<{ booking: Booking }>(`/api/admin/bookings/${selected.id}/cancel`, { method: "PATCH", body: { reason } });
      setSelected(res.booking); await load(); await openBooking(res.booking);
    } catch (error) { alert((error as Error).message || "Failed to cancel booking"); }
    finally { setOperationLoading(false); }
  }

  async function reassignBooking() {
    if (!selected || !replacementProviderId || operationLoading) return;
    const reason = window.prompt("Reason for reassigning this booking (minimum 10 characters):")?.trim();
    if (!reason) return;
    setOperationLoading(true);
    try {
      const res = await api<{ booking: Booking }>(`/api/admin/bookings/${selected.id}/reassign`, { method: "PATCH", body: { providerId: replacementProviderId, reason } });
      setSelected(res.booking); await load(); await openBooking(res.booking);
    } catch (error) { alert((error as Error).message || "Failed to reassign booking"); }
    finally { setOperationLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Stats header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STAT_CONFIG.map(s => (
          <button
            key={s.key}
            onClick={() => { setStatusFilter(s.key); setPage(1); }}
            className={`${s.bg} rounded-xl px-4 py-3 text-left transition-all hover:opacity-80 ${statusFilter === s.key ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
          >
            <p className={`text-2xl font-bold ${s.color}`}>{counts[s.key as keyof typeof counts]}</p>
            <p className="text-xs text-slate-600 font-medium mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-5 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search customer, provider, service, address, phone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh">
              <RefreshCw size={16} />
            </button>
            {canExport && <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium" title="Exports the current server page">
              <Download size={15} /> Export Page
            </button>}
          </div>

          {/* Date filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1">
              {[{ label: "Today", p: "today" }, { label: "7 days", p: "7d" }, { label: "30 days", p: "30d" }].map(({ label, p }) => (
                <button key={p} onClick={() => applyPreset(p)} className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                  {label}
                </button>
              ))}
            </div>
            {(search || statusFilter !== "all" || dateFrom || dateTo) && (
              <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                <X size={12} /> Clear filters
              </button>
            )}
            <div className="ml-auto text-xs text-slate-500 font-medium">
              {filtered.length > 0 && <span>Visible completed value: <span className="text-emerald-700 font-bold">{currency(totalRevenue)}</span></span>}
            </div>
          </div>
        </div>

        {/* Table */}
        {loadError ? (
          <div className="py-10 px-5 text-center text-sm text-red-600 bg-red-50 border-t border-red-200">
            Failed to load bookings: {loadError}
            <button onClick={load} className="ml-3 underline text-red-700 hover:text-red-900">Retry</button>
          </div>
        ) : loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading bookings...</div>
        ) : paged.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">No bookings match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Service</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Provider</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Payment</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Price</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((b) => (
                  <tr key={b.id} data-focus-id={b.id === focusId || b.publicId === focusId ? b.id : undefined} className={b.id === focusId || b.publicId === focusId ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50 transition-colors"} title={b.publicId || b.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800 capitalize">{b.service.replace(/_/g, " ")}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[180px]">{b.address}</p>
                      {b.publicId && <p className="text-[10px] font-mono text-slate-400 mt-0.5">{b.publicId}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{b.customerName}</p>
                      <p className="text-xs text-slate-400">{b.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{b.providerName}</p>
                      <p className="text-xs text-slate-400">{b.providerPhone}</p>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        (b as any).paymentStatus === "received" ? "bg-emerald-100 text-emerald-700" :
                        (b as any).paymentStatus === "paid" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {(b as any).paymentStatus === "received" ? "Confirmed" :
                         (b as any).paymentStatus === "paid" ? "Paid" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{b.price ? currency(b.price) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{b.scheduledDate}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50" onClick={() => openBooking(b)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {filtered.length === 0 ? "0 bookings" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} bookings`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs text-slate-600 px-1">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Booking Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-800 capitalize">{selected.service.replace(/_/g, " ")}</h3>
                <p className="text-xs text-slate-400 font-mono">#{selected.id.slice(-8).toUpperCase()}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={selected.status} />
                {selected.rating && (
                  <span className="text-xs bg-amber-50 border border-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    ★ {selected.rating}/5
                  </span>
                )}
              </div>

              <BookingTimeline status={selected.status} />

              <BookingOperationalSummary booking={selected} />

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Customer", selected.customerName],
                  ["Customer Phone", selected.customerPhone],
                  ["Provider", selected.providerName],
                  ["Provider Phone", selected.providerPhone],
                  ["Address", selected.address],
                  ["Scheduled", `${selected.scheduledDate} ${selected.scheduledTime}`],
                  ["Job Price", selected.price ? currency(selected.price) : "—"],
                  ["Payment Status", (selected as any).paymentStatus || "pending"],
                  ["Provider Arrived", (selected as any).providerArrivedAt ? formatDate((selected as any).providerArrivedAt) : "Not yet"],
                  ["Commission Rate", `${selected.commissionRate}%`],
                  ["Commission Amount", currency(selected.commissionAmount)],
                  ["Provider Earnings", currency(selected.providerAmount)],
                  ["Created", formatDate(selected.createdAt)],
                  ["Last Updated", formatDate(selected.updatedAt)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-sm font-medium text-slate-800 break-words">{String(val)}</p>
                  </div>
                ))}
              </div>

              {canWrite && ["pending", "accepted"].includes(selected.status) && !selected.providerArrivedAt && !selected.jobStartedAt && selected.paymentStatus !== "paid" && selected.paymentStatus !== "received" && (
                <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3" data-testid="booking-operations-panel">
                  <div className="flex items-center gap-2"><ShieldAlert size={17} className="text-orange-700" /><p className="text-sm font-semibold text-orange-900">Operations intervention</p></div>
                  <p className="text-xs text-orange-800">Only unstarted, unpaid bookings can be changed here. All actions require a reason and are audited.</p>
                  {selected.status === "pending" && (
                    <div className="flex gap-2">
                      <select value={replacementProviderId} onChange={e => setReplacementProviderId(e.target.value)} className="flex-1 px-3 py-2 text-sm border border-orange-200 rounded-lg bg-white">
                        <option value="">Choose eligible replacement provider</option>
                        {availableProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name} — {provider.location || "No location"}</option>)}
                      </select>
                      <button disabled={!replacementProviderId || operationLoading} onClick={reassignBooking} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"><UserRoundCog size={15}/> Reassign</button>
                    </div>
                  )}
                  <button disabled={operationLoading} onClick={cancelBooking} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">Cancel booking</button>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">Operations history</p>
                {operations.length === 0 ? <p className="text-xs text-slate-400">No admin interventions recorded.</p> : <div className="space-y-2">{operations.map(operation => <div key={operation.id} className="text-xs border-l-2 border-slate-300 pl-3"><p className="font-medium text-slate-700 capitalize">{operation.action} by {operation.adminName}</p><p className="text-slate-500">{operation.reason}</p><p className="text-slate-400">{formatDate(operation.createdAt)}</p></div>)}</div>}
              </div>

              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500 mb-1">Customer Description</p>
                <p className={`text-sm ${selected.description ? "text-slate-700" : "text-slate-400 italic"}`}>
                  {selected.description || "No additional details provided."}
                </p>
              </div>

              {selected.videoUrl && (
                <div className="bg-slate-50 rounded-lg px-3 py-3">
                  <p className="text-xs text-slate-500 mb-2">Customer Video</p>
                  <PrivateVideo objectPath={selected.videoUrl} />
                </div>
              )}

              {selected.review && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-600 mb-1">Customer Review</p>
                  <p className="text-sm text-amber-800">{selected.review}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
