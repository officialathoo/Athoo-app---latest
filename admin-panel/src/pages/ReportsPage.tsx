import { useState } from "react";
import { api, currency, getApiBase, getToken } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { TrendingUp, Download, Calendar, Loader2, BarChart2, Users, Wallet, ArrowDownLeft, ArrowUpRight, RotateCcw, BadgeCheck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface ReportData {
  bookingsByStatus: { status: string; count: number }[];
  bookingsByService: { service: string; count: number; jobValue: number; commission: number }[];
  revenueByDay: { day: string; completedBookings: number; jobValue: number; commission: number; providerEarnings: number }[];
  newUsersByDay: { day: string; customers: number; providers: number }[];
  topProviders: { id: string; name: string; totalJobs: number; rating: number; ratingCount: number; pendingCommission: number; totalCommission: number }[];
  topServices: { service: string; count: number }[];
  cashMovements: { entryType: string; amount: number; count: number }[];
  ledgerByDay: { day: string; commissions: number; withdrawals: number; refunds: number; subscriptions: number }[];
  period: { from: string; to: string };
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  cancelled: "#ef4444",
  accepted: "#8b5cf6",
};

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

function toDate(d: Date) { return d.toISOString().split("T")[0]; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

export function ReportsPage() {
  const { hasPermission } = usePermissions();
  const canExport = hasPermission("export.read");
  const [from, setFrom] = useState(() => toDate(daysAgo(30)));
  const [to, setTo] = useState(() => toDate(new Date()));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-reports", from, to],
    queryFn: () => api<ReportData>(`/api/admin/reports?from=${from}&to=${to}`),
    staleTime: 60000,
  });

  const report = data as ReportData | undefined;

  const totalRevenue = report?.revenueByDay.reduce((a, d) => a + (d.jobValue || 0), 0) || 0;
  const totalCommission = report?.revenueByDay.reduce((a, d) => a + (d.commission || 0), 0) || 0;
  const totalBookings = report?.revenueByDay.reduce((a, d) => a + (d.completedBookings || 0), 0) || 0;
  const totalNewUsers = report?.newUsersByDay.reduce((a, d) => a + (d.customers || 0) + (d.providers || 0), 0) || 0;

  function handleExport(type: string) {
    const base = getApiBase();
    const token = getToken();
    const url = `${base}/api/admin/export/${type}?from=${from}&to=${to}`;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `${type}-report.csv`);
    // Include auth header via fetch and blob
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Export failed (${r.status})`);
        return r.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      })
      .catch((error) => window.alert(error.message || "Export failed"));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Analytics & Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">Platform-wide performance metrics and trends</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm shadow-sm">
            <Calendar size={15} className="text-slate-400" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="outline-none text-slate-700 text-sm" />
            <span className="text-slate-400">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="outline-none text-slate-700 text-sm" />
          </div>
          {canExport && <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-white text-sm rounded-xl hover:bg-slate-700 transition-colors shadow-sm">
              <Download size={15} /> Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-1 w-44 hidden group-hover:block">
              {["bookings", "users", "finance", "providers", "support"].map(t => (
                <button key={t} onClick={() => handleExport(t)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 capitalize">
                  Export {t}
                </button>
              ))}
            </div>
          </div>}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Generating report...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
          {(error as Error).message}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Completed Job Value", value: currency(totalRevenue), sub: "completed services only", icon: Wallet, color: "text-green-600", bg: "bg-green-50" },
              { label: "Platform Commission", value: currency(totalCommission), sub: `${totalRevenue > 0 ? ((totalCommission / totalRevenue) * 100).toFixed(1) : 0}% of revenue`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Completed Jobs", value: totalBookings.toLocaleString(), sub: "completed in selected period", icon: BarChart2, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "New Users", value: totalNewUsers.toLocaleString(), sub: "customers + providers", icon: Users, color: "text-orange-600", bg: "bg-orange-50" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <c.icon size={20} className={c.color} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{c.value}</p>
                <p className="text-sm font-medium text-slate-700 mt-1">{c.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { type: "commission_received", label: "Commission Received", icon: ArrowDownLeft, tone: "text-indigo-600 bg-indigo-50" },
              { type: "provider_withdrawal", label: "Withdrawals Paid", icon: ArrowUpRight, tone: "text-violet-600 bg-violet-50" },
              { type: "customer_refund", label: "Refunds Paid", icon: RotateCcw, tone: "text-rose-600 bg-rose-50" },
              { type: "subscription_received", label: "Subscription Revenue", icon: BadgeCheck, tone: "text-cyan-600 bg-cyan-50" },
            ].map((item) => {
              const row = report?.cashMovements.find((entry) => entry.entryType === item.type);
              return <div key={item.type} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tone}`}><item.icon size={19}/></div>
                <div><p className="text-xl font-bold text-slate-900">{currency(row?.amount || 0)}</p><p className="text-xs text-slate-500">{item.label} · {row?.count || 0} entries</p></div>
              </div>;
            })}
          </div>

          {/* Revenue & Bookings Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-5">Revenue & Bookings Over Time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={report?.revenueByDay || []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => v.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `Rs.${(v/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip formatter={(v, name) => [name === "jobValue" || name === "commission" ? currency(Number(v)) : v, name]} />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="jobValue" name="Completed Job Value" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
                <Area yAxisId="left" type="monotone" dataKey="commission" name="Commission" stroke="#22c55e" fill="#dcfce7" strokeWidth={2} />
                <Bar yAxisId="right" dataKey="completedBookings" name="Completed Jobs" fill="#8b5cf6" opacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Booking Status Distribution */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-5">Booking Status Distribution</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={report?.bookingsByStatus || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                      {(report?.bookingsByStatus || []).map((entry, i) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(report?.bookingsByStatus || []).map((s, i) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] || CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="capitalize text-slate-700">{s.status.replace("_", " ")}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* New Users Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-5">New Registrations</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={report?.newUsersByDay || []} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="customers" name="Customers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="providers" name="Providers" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Providers */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Top Providers by Jobs</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Provider</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">Jobs</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">Rating</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(report?.topProviders || []).map((p, i) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-5">#{i + 1}</span>
                          {p.name}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700">{p.totalJobs}</td>
                      <td className="px-5 py-3 text-right text-slate-700">
                        {p.ratingCount > 0 ? (p.rating / 10).toFixed(1) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700">{currency(p.totalCommission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top Services */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Top Services</h3>
              </div>
              <div className="p-5 space-y-3">
                {(report?.bookingsByService || []).slice(0, 8).map((s, i) => {
                  const max = report?.bookingsByService[0]?.count || 1;
                  return (
                    <div key={s.service} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-5">#{i + 1}</span>
                      <span className="text-sm text-slate-700 w-28 capitalize shrink-0">{s.service.replace(/_/g, " ")}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${(s.count / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-700 w-8 text-right">{s.count}</span>
                      <span className="text-xs text-slate-400 w-24 text-right">{currency(s.jobValue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

