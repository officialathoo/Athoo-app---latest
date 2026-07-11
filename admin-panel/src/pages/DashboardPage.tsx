import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { api, currency } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { DashboardData } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminDashboardSkeleton } from "@/components/ui/AdminDashboardSkeleton";
import { Link } from "wouter";
import { formatDate } from "@/lib/api";
import {
  Users, UserCog, CheckCircle, Clock, AlertCircle, Wallet,
  TrendingUp, ShieldCheck, Activity, MessageSquareWarning,
  RefreshCw, Tag, XCircle, ArrowRight, Zap,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  accepted: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-700",
};

function toDate(d: Date) { return d.toISOString().split("T")[0]; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

export function DashboardPage() {
  const [trendDays, setTrendDays] = useState<7 | 30>(7);
  const { hasPermission } = usePermissions();
  const canViewReports = hasPermission("reports.read");
  const canViewAudit = hasPermission("audit.read");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api<{ dashboard: DashboardData }>("/api/admin/dashboard"),
    refetchInterval: 180000,
    staleTime: 15000,
  });

  const trendFrom = toDate(daysAgo(trendDays));
  const trendTo = toDate(new Date());

  const { data: trendData, refetch: refetchTrend } = useQuery({
    queryKey: ["dashboard-trend", trendDays],
    queryFn: () => api<{ revenueByDay: { day: string; bookings: number; revenue: number; commission: number }[] }>(`/api/admin/reports?from=${trendFrom}&to=${trendTo}`),
    staleTime: 60000,
    enabled: canViewReports,
  });

  const { data: auditData, refetch: refetchAudit } = useQuery({
    queryKey: ["dashboard-audit"],
    queryFn: () => api<{ entries?: any[]; logs?: any[] }>("/api/admin/audit-log?page=1&limit=8"),
    refetchInterval: 180000,
    staleTime: 15000,
    enabled: canViewAudit,
  });

  const d = data?.dashboard;
  const revenueByDay = trendData?.revenueByDay || [];
  const auditEntries = auditData?.entries || auditData?.logs || [];

  if (isLoading) {
    return <AdminDashboardSkeleton />;
  }

  if (error || !d) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
        <p className="text-sm font-semibold text-red-800">Dashboard data could not be loaded</p>
        <p className="mt-1 text-sm text-red-700">{(error as Error)?.message || "Please check the API connection and try again."}</p>
        <button
          type="button"
          onClick={() => { refetch(); if (canViewReports) refetchTrend(); if (canViewAudit) refetchAudit(); }}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-800"
        >
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operations overview"
        title="Good to see you — here is Athoo today"
        description="Monitor bookings, provider health, customer activity, financial exposure and operational follow-ups from one control center."
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            data-testid="admin-dashboard-refresh"
          >
            <RefreshCw size={13} /> Refresh dashboard
          </button>
        }
      />
      <p className="text-xs text-slate-400">
        Last updated: {new Date(d.generatedAt).toLocaleTimeString()} · automatically refreshes every 3 minutes
      </p>

      {/* Primary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={d.users} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" to="/users" testId="admin-stat-users" />
        <StatCard label="Providers" value={d.providers} icon={UserCog} iconColor="text-orange-600" iconBg="bg-orange-50" to="/users" />
        <StatCard label="Online Providers" value={d.onlineProviders} icon={Zap} iconColor="text-emerald-600" iconBg="bg-emerald-50" to="/providers" />
        <StatCard label="Customers" value={d.customers} icon={Users} iconColor="text-sky-600" iconBg="bg-sky-50" to="/users" />
        <StatCard label="Active Jobs" value={d.activeBookings} icon={Activity} iconColor="text-purple-600" iconBg="bg-purple-50" to="/bookings" testId="admin-stat-active-jobs" />
        <StatCard label="Pending Bookings" value={d.pendingBookings} icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" to="/bookings" />
        <StatCard label="Completed Jobs" value={d.completedBookings} icon={CheckCircle} iconColor="text-emerald-600" iconBg="bg-emerald-50" to="/bookings" />
        <StatCard label="Cancelled" value={d.cancelledBookings ?? 0} icon={XCircle} iconColor="text-red-500" iconBg="bg-red-50" to="/bookings" />
        <StatCard label="Blocked Providers" value={d.blockedProviders} icon={AlertCircle} iconColor="text-red-600" iconBg="bg-red-50" to="/users" />
        <StatCard label="Pending Verification" value={d.pendingVerification} icon={ShieldCheck} iconColor="text-indigo-600" iconBg="bg-indigo-50" to="/verification" />
        <StatCard label="Open Complaints" value={d.openSupportTickets ?? 0} icon={MessageSquareWarning} iconColor="text-rose-600" iconBg="bg-rose-50" to="/complaints" />
        <StatCard label="Active Promos" value={d.activePromotions ?? 0} icon={Tag} iconColor="text-violet-600" iconBg="bg-violet-50" to="/promotions" />
        <StatCard label="Verified Providers" value={d.approvedVerification} icon={ShieldCheck} iconColor="text-green-600" iconBg="bg-green-50" to="/verification" />
      </div>

      {/* Revenue row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Completed Job Value" value={currency(d.completedJobValue)} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" to="/finance" testId="admin-stat-revenue" />
        <StatCard label="Athoo Commission Earned" value={currency(d.earnedCommission)} icon={Wallet} iconColor="text-blue-600" iconBg="bg-blue-50" to="/finance" />
        <StatCard label="Pending Commission (Dues)" value={currency(d.pendingCommission)} icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" to="/finance" />
      </div>

      {d.alerts.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="operations-alerts-title" data-testid="admin-operations-alerts">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="operations-alerts-title" className="text-sm font-semibold text-amber-950">Operational follow-ups</h2>
              <p className="mt-1 text-xs text-amber-800">Queues and workflows that need administrator attention.</p>
            </div>
            <AlertCircle className="text-amber-700" size={20} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.alerts.map((alert) => (
              <Link key={alert.key} to={alert.to}>
                <div className={`rounded-xl border bg-white p-3 transition hover:shadow-sm ${alert.severity === "high" ? "border-red-200" : "border-amber-200"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-700">{alert.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${alert.severity === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{alert.count}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Revenue trend chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Revenue & Booking Trend</h3>
            <p className="text-xs text-slate-400 mt-0.5">Daily revenue and booking volume</p>
          </div>
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {([7, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${trendDays === d ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {!canViewReports ? (
          <div className="h-48 flex items-center justify-center text-center text-slate-400 text-sm">Reports permission is required to view financial trends.</div>
        ) : revenueByDay.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No completed booking data exists for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueByDay} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(v: any, name: string) => [
                  name === "bookings" ? v : currency(Number(v)),
                  name === "revenue" ? "Revenue" : name === "commission" ? "Commission" : "Bookings",
                ]}
                labelFormatter={l => `Date: ${l}`}
              />
              <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="commission" stroke="#22c55e" fill="url(#commGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking Pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Booking Pipeline</h3>
          <div className="space-y-3">
            {[
              { label: "Pending", count: d.pendingBookings, color: "bg-amber-500" },
              { label: "Active / In Progress", count: d.activeBookings, color: "bg-purple-500" },
              { label: "Completed", count: d.completedBookings, color: "bg-emerald-500" },
              { label: "Cancelled", count: d.cancelledBookings ?? 0, color: "bg-red-400" },
            ].map(({ label, count, color }) => {
              const total = Math.max(1, d.pendingBookings + d.activeBookings + d.completedBookings + (d.cancelledBookings ?? 0));
              const pct = Math.round((count / total) * 100);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-800">{count} <span className="text-xs text-slate-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Link to="/bookings" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-4 font-medium">
            View all bookings <ArrowRight size={12} />
          </Link>
        </div>

        {/* Recent Admin Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold text-slate-800">Recent Admin Activity</h3>
            </div>
            {canViewAudit && (
              <Link to="/audit-log" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                Full log <ArrowRight size={11} />
              </Link>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
            {!canViewAudit ? (
              <div className="px-6 py-8 text-center text-slate-400 text-sm">Audit permission is required to view administrator activity.</div>
            ) : auditEntries.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-400 text-sm">No recent administrator activity</div>
            ) : auditEntries.map((entry: any) => (
              <div key={entry.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {(entry.adminName || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800">{entry.adminName || "Admin"}</span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-medium">{entry.action}</span>
                      {entry.targetType && <span className="text-xs text-slate-400 capitalize">{entry.targetType}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{timeAgo(entry.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Config Quick View */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Platform Configuration</h3>
          <Link to="/settings" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            Edit <ArrowRight size={11} />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ["Commission Rate", `${d.settings?.commissionRate ?? 0}%`],
            ["Due Limit", currency(d.settings?.defaultCommissionLimit)],
            ["Visit Charge", currency((d.settings as any)?.defaultVisitCharge ?? 200)],
            ["Verified Providers", String(d.approvedVerification)],
            ["Active Promos", String(d.activePromotions ?? 0)],
            ["Open Tickets", String(d.openSupportTickets ?? 0)],
          ].map(([label, val]) => (
            <div key={String(label)} className="bg-slate-50 rounded-xl px-3 py-3 text-center">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className="text-sm font-bold text-slate-800">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Bookings */}
      {d.recentBookings && d.recentBookings.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Recent Bookings</h3>
            <Link to="/bookings" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {d.recentBookings.slice(0, 8).map(b => (
              <div key={b.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                    <Activity size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{b.customerName} → {b.providerName}</p>
                    <p className="text-xs text-slate-400 capitalize">{b.service.replace(/_/g, " ")} · {formatDate(b.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {b.price != null && <span className="text-xs font-medium text-slate-700">{currency(b.price)}</span>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[b.status] || "bg-slate-100 text-slate-600"}`}>
                    {b.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending Verification", count: d.pendingVerification, to: "/verification", color: "text-indigo-600", bg: "bg-indigo-50", icon: ShieldCheck },
          { label: "Open Complaints", count: d.openSupportTickets ?? 0, to: "/complaints", color: "text-rose-600", bg: "bg-rose-50", icon: MessageSquareWarning },
          { label: "Pending Withdrawals", count: d.pendingWithdrawals, to: "/withdrawals", color: "text-emerald-600", bg: "bg-emerald-50", icon: Wallet },
          { label: "Pending Refunds", count: d.pendingRefunds, to: "/refunds", color: "text-orange-600", bg: "bg-orange-50", icon: RefreshCw },
        ].map(item => (
          <Link key={item.to} to={item.to}>
            <div className={`${item.bg} rounded-xl p-4 flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer`}>
              <item.icon size={20} className={item.color} />
              <div>
                <p className={`text-lg font-bold ${item.color}`}>{item.count !== null ? item.count : "→"}</p>
                <p className="text-xs text-slate-600 font-medium">{item.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
