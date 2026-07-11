import { useQuery } from "@tanstack/react-query";
import { api, formatDate } from "@/lib/api";
import { LogIn, Shield, ShieldOff, Loader2, Smartphone, Monitor } from "lucide-react";
import { useState } from "react";

type LoginEntry = {
  id: string;
  userId?: string;
  phone?: string;
  email?: string;
  role?: string;
  method: string;
  success: boolean;
  failReason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
};

export function LoginHistoryPage() {
  const [successFilter, setSuccessFilter] = useState<"all" | "success" | "failed">("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["login-history", successFilter, page],
    queryFn: () => api<{ logs: LoginEntry[]; total: number }>(`/api/admin/login-history?page=${page}&limit=${limit}${successFilter !== "all" ? `&success=${successFilter === "success"}` : ""}`),
    staleTime: 30000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const successCount = logs.filter(l => l.success).length;
  const failedCount = logs.filter(l => !l.success).length;

  function getMethodIcon(method: string) {
    if (method === "biometric") return "🔏";
    if (method === "password") return "🔑";
    return "📱";
  }

  function getRoleColor(role?: string) {
    if (role === "admin") return "bg-purple-100 text-purple-700";
    if (role === "provider") return "bg-orange-100 text-orange-700";
    return "bg-blue-100 text-blue-700";
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Login History</h1>
          <p className="text-sm text-slate-500 mt-0.5">All authentication attempts across the platform</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <LogIn size={16} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total (page)</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{logs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-emerald-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Successful</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{successCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldOff size={16} className="text-red-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Failed</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{failedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "success", "failed"] as const).map(f => (
          <button key={f} onClick={() => { setSuccessFilter(f); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${successFilter === f ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading history…
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <LogIn size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No login history yet</p>
          <p className="text-slate-400 text-sm mt-1">Login attempts will appear here once users start signing in</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Method</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Result</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">IP Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(l => (
                  <tr key={l.id} className={`hover:bg-slate-50 transition-colors ${!l.success ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{l.phone || l.email || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <span>{getMethodIcon(l.method)}</span>
                        <span className="text-xs">{l.method}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.role && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getRoleColor(l.role)}`}>
                          {l.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {l.success ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                          <Shield size={11} /> Success
                        </span>
                      ) : (
                        <div>
                          <span className="flex items-center gap-1 text-red-600 text-xs font-semibold">
                            <ShieldOff size={11} /> Failed
                          </span>
                          {l.failReason && <p className="text-xs text-red-400 mt-0.5">{l.failReason}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{l.ipAddress || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{total} total entries</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-slate-600">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
