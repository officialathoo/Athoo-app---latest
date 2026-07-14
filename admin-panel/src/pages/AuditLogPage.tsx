import React, { useState } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Search, Shield, ChevronLeft, ChevronRight, Loader2, Info, RefreshCw, Download, Filter } from "lucide-react";

interface AuditEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  login: "bg-slate-100 text-slate-700",
  resolve: "bg-purple-100 text-purple-800",
  assign: "bg-orange-100 text-orange-800",
  ban: "bg-red-100 text-red-800",
  unban: "bg-green-100 text-green-800",
  export: "bg-cyan-100 text-cyan-800",
  send: "bg-indigo-100 text-indigo-800",
};

function actionColor(action: string) {
  const key = Object.keys(ACTION_COLORS).find(k => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : "bg-slate-100 text-slate-600";
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const ACTION_TYPES = ["All", "create", "update", "delete", "login", "ban", "unban", "send", "export", "resolve", "assign"];

export function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 25;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-log", page, search, actionFilter],
    queryFn: () =>
      api<{ entries?: AuditEntry[]; logs?: AuditEntry[]; total: number }>(
        `/api/admin/audit-log?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${actionFilter !== "All" ? `&action=${encodeURIComponent(actionFilter)}` : ""}`
      ),
    staleTime: 30000,
  });

  const entries = data?.entries || data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const handleExportCsv = () => {
    if (!entries.length) return;
    const headers = ["Time", "Admin", "Action", "Target Type", "Target ID", "IP Address"];
    const rows = entries.map(e => [
      new Date(e.createdAt).toISOString(),
      e.adminName || e.adminId,
      e.action,
      e.targetType || "",
      e.targetId || "",
      e.ipAddress || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
          <p className="text-sm text-slate-500 mt-0.5">Complete history of all admin actions — {total.toLocaleString()} entries</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              className="pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            >
              {ACTION_TYPES.map(t => <option key={t} value={t}>{t === "All" ? "All Actions" : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
              placeholder="Search actions or admins…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium"
            title="Export CSV"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading audit log…
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Target</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(entry => (
                  <React.Fragment key={entry.id}>
                    <tr
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    >
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                        <p className="text-xs">{timeAgo(entry.createdAt)}</p>
                        <p className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {(entry.adminName || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-slate-800 font-medium">{entry.adminName || entry.adminId.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${actionColor(entry.action)}`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-slate-500 text-xs">
                        {entry.targetType && <span className="capitalize">{entry.targetType}</span>}
                        {entry.targetId && <span className="text-slate-400"> #{entry.targetId.slice(0, 8)}</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {entry.details && (
                          <Info size={15} className={`text-slate-300 transition-colors ${expanded === entry.id ? "text-blue-500" : ""}`} />
                        )}
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-5 py-3 space-y-2">
                          {entry.ipAddress && (
                            <p className="text-xs text-slate-500 font-mono">
                              <span className="font-semibold text-slate-700">IP: </span>{entry.ipAddress}
                            </p>
                          )}
                          {entry.details && (
                            <pre className="text-xs text-slate-600 font-mono bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-32">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                      <Shield size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No audit log entries</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-slate-700 px-2">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

