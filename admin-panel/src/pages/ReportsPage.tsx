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

type ReportTable = { name: string; header: string[]; rows: (string | number)[][] };

function reportTables(report: ReportData): ReportTable[] {
  return [
    {
      name: "Revenue",
      header: ["Day", "Completed Jobs", "Job Value", "Commission", "Provider Earnings"],
      rows: report.revenueByDay.map((r) => [r.day, r.completedBookings, r.jobValue, r.commission, r.providerEarnings]),
    },
    {
      name: "New Users",
      header: ["Day", "Customers", "Providers"],
      rows: report.newUsersByDay.map((r) => [r.day, r.customers, r.providers]),
    },
    {
      name: "Bookings by Status",
      header: ["Status", "Count"],
      rows: report.bookingsByStatus.map((r) => [r.status, r.count]),
    },
    {
      name: "Bookings by Service",
      header: ["Service", "Count", "Job Value", "Commission"],
      rows: report.bookingsByService.map((r) => [r.service, r.count, r.jobValue, r.commission]),
    },
    {
      name: "Top Providers",
      header: ["Provider", "Jobs", "Rating", "Rating Count", "Pending Commission", "Total Commission"],
      rows: report.topProviders.map((r) => [
        r.name, r.totalJobs, r.ratingCount > 0 ? (r.rating / 10).toFixed(1) : "", r.ratingCount, r.pendingCommission, r.totalCommission,
      ]),
    },
    {
      name: "Top Services",
      header: ["Service", "Count"],
      rows: report.topServices.map((r) => [r.service, r.count]),
    },
    {
      name: "Cash Movements",
      header: ["Entry Type", "Amount", "Count"],
      rows: report.cashMovements.map((r) => [r.entryType, r.amount, r.count]),
    },
    {
      name: "Ledger by Day",
      header: ["Day", "Commissions", "Withdrawals", "Refunds", "Subscriptions"],
      rows: report.ledgerByDay.map((r) => [r.day, r.commissions, r.withdrawals, r.refunds, r.subscriptions]),
    },
  ];
}

function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

function excelSheet(name: string, header: string[], rows: ReportTable["rows"]): string {
  const headerRow = `<Row>${header.map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlText(h)}</Data></Cell>`).join("")}</Row>`;
  const body = rows
    .map((row) =>
      `<Row>${row
        .map((cell) =>
          typeof cell === "number" && Number.isFinite(cell)
            ? `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`
            : `<Cell><Data ss:Type="String">${xmlText(cell)}</Data></Cell>`,
        )
        .join("")}</Row>`,
    )
    .join("");
  return `<Worksheet ss:Name="${xmlText(sanitizeSheetName(name))}"><Table>${headerRow}${body}</Table></Worksheet>`;
}

function buildExcel(report: ReportData): string {
  const sheets = reportTables(report).map((t) => excelSheet(t.name, t.header, t.rows)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles><Style ss:ID="Header"><Font ss:Bold="1"/></Style></Styles>
 ${sheets}
</Workbook>`;
}

function buildReportHtml(report: ReportData): string {
  const escape = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const totalRevenue = report.revenueByDay.reduce((a, d) => a + (d.jobValue || 0), 0);
  const totalCommission = report.revenueByDay.reduce((a, d) => a + (d.commission || 0), 0);
  const totalBookings = report.revenueByDay.reduce((a, d) => a + (d.completedBookings || 0), 0);
  const totalNewUsers = report.newUsersByDay.reduce((a, d) => a + (d.customers || 0) + (d.providers || 0), 0);
  const renderTable = ({ header, rows }: ReportTable) =>
    `<table><thead><tr>${header.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  const sections = reportTables(report)
    .map((t) => `<section><h2>${escape(t.name)}</h2>${renderTable(t)}</section>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Athoo Analytics Report</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
header h1 { font-size: 22px; margin: 0 0 4px; }
.subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
.summary { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; min-width: 170px; }
.kpi .v { font-size: 20px; font-weight: 700; }
.kpi .l { font-size: 11px; color: #64748b; margin-top: 2px; }
section { margin-bottom: 22px; page-break-inside: auto; }
h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .4px; color: #334155; margin: 0 0 8px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { background: #f1f5f9; text-align: left; color: #475569; }
th, td { border: 1px solid #e2e8f0; padding: 6px 9px; }
tr { page-break-inside: avoid; }
@media print { .no-print { display: none; } }
</style></head><body>
<header>
  <h1>Athoo Analytics &amp; Reports</h1>
  <div class="subtitle">Period: ${escape(report.period.from)} &rarr; ${escape(report.period.to)} &middot; Generated ${new Date().toLocaleString()}</div>
</header>
<div class="summary">
  <div class="kpi"><div class="v">${currency(totalRevenue)}</div><div class="l">Completed Job Value</div></div>
  <div class="kpi"><div class="v">${currency(totalCommission)}</div><div class="l">Platform Commission</div></div>
  <div class="kpi"><div class="v">${totalBookings.toLocaleString()}</div><div class="l">Completed Jobs</div></div>
  <div class="kpi"><div class="v">${totalNewUsers.toLocaleString()}</div><div class="l">New Users</div></div>
</div>
${sections}
</body></html>`;
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

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

  function handleExportExcel() {
    if (!report) { window.alert("Report data is not ready yet. Please wait for it to load."); return; }
    downloadBlob(buildExcel(report), "application/vnd.ms-excel", `athoo-analytics-${from}-${to}.xls`);
  }

  function handleExportPdf() {
    if (!report) { window.alert("Report data is not ready yet. Please wait for it to load."); return; }
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { window.alert("Pop-up blocked. Please allow pop-ups to export the PDF."); return; }
    win.document.open();
    win.document.write(buildReportHtml(report));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
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
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-1 w-48 hidden group-hover:block max-h-96 overflow-y-auto">
              <div className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">CSV</div>
              {["bookings", "users", "finance", "providers", "support"].map(t => (
                <button key={t} onClick={() => handleExport(t)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 capitalize">
                  Export {t}
                </button>
              ))}
              <div className="border-t border-slate-100 my-1" />
              <div className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Document</div>
              <button onClick={handleExportExcel} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Export Excel (.xls)
              </button>
              <button onClick={handleExportPdf} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Export PDF
              </button>
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

