import { useEffect, useState, useMemo } from "react";
import { api, currency, formatDate } from "@/lib/api";
import { Search, RefreshCw, Download, ChevronLeft, ChevronRight, X, FileText, Printer, CheckCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buildCsv } from "@/lib/csv";

const PAGE_SIZE = 25;

interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingPublicId?: string | null;
  customerId: string;
  providerId: string;
  customerName: string;
  providerName: string;
  service: string;
  address: string;
  scheduledDate: string;
  scheduledTime: string;
  ratePerHour?: number | null;
  durationMinutes?: number | null;
  jobStartedAt?: string | null;
  jobCompletedAt?: string | null;
  subtotal: number;
  visitCharge: number;
  platformFee: number;
  discountAmount: number;
  totalAmount: number;
  commissionAmount: number;
  providerAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "issued", label: "Issued" },
  { value: "paid", label: "Paid" },
  { value: "disputed", label: "Disputed" },
  { value: "cancelled", label: "Cancelled" },
];

function today() {
  return new Date().toISOString().split("T")[0];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustStatus, setAdjustStatus] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  async function handleAdjustStatus() {
    if (!selected || !adjustStatus || adjustStatus === selected.status) return;
    setAdjusting(true);
    try {
      const res = await api<{ invoice: Invoice }>(`/api/admin/invoices/${selected.id}/status`, {
        method: "PATCH",
        body: { status: adjustStatus, reason: adjustReason },
      });
      setInvoices(prev => prev.map(i => i.id === res.invoice.id ? res.invoice : i));
      setSelected(res.invoice);
      setAdjustStatus("");
      setAdjustReason("");
    } catch (e: any) {
      alert(e?.message || "Failed to update invoice status");
    } finally {
      setAdjusting(false);
    }
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ invoices: Invoice[] }>("/api/admin/invoices");
      setInvoices(res.invoices || []);
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.providerName.toLowerCase().includes(q) ||
        inv.service.toLowerCase().includes(q) ||
        inv.address?.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalRevenue = useMemo(() =>
    filtered.reduce((s, inv) => s + (inv.totalAmount || 0), 0),
    [filtered]);

  const totalCommission = useMemo(() =>
    filtered.reduce((s, inv) => s + (inv.commissionAmount || 0), 0),
    [filtered]);

  function buildInvoiceHtml(inv: Invoice) {
    const serviceAmount = Number(inv.subtotal || 0);
    const visitCharge = Number(inv.visitCharge || 0);
    const jobNumber = inv.bookingPublicId || inv.bookingId;
    const rate = Number(inv.ratePerHour || 0);
    const duration = Number(inv.durationMinutes || 0);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
<style>
  @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e2e8f0;color:#0f172a;font-family:Arial,sans-serif}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;padding-bottom:34mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .header{min-height:48mm;background:linear-gradient(135deg,#1A6EE0,#0D4BA0);color:#fff;padding:15mm 16mm 11mm;display:flex;justify-content:space-between;align-items:flex-start}
  .brand{display:flex;gap:12px;align-items:center}.logo{width:52px;height:52px;border-radius:14px;background:#fff;object-fit:contain;padding:4px}.brand-name{font-size:28px;font-weight:900}.brand-sub{font-size:11px;opacity:.82;margin-top:3px}.meta{text-align:right}.title{font-size:12px;letter-spacing:2px;opacity:.78}.number{font-size:20px;font-weight:900;margin-top:4px}.status{display:inline-block;margin-top:8px;padding:5px 12px;border:1px solid rgba(255,255,255,.45);border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase}
  .body{padding:12mm 16mm}.refs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:9mm}.ref,.party{border:1px solid #cbd5e1;border-radius:9px;padding:10px}.label{font-size:9px;color:#94a3b8;font-weight:800;text-transform:uppercase;letter-spacing:.7px}.value{font-size:12px;font-weight:700;margin-top:4px;word-break:break-word}.parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8mm}.party{background:#f8fafc}.party strong{display:block;font-size:15px;margin-top:5px}.detail{font-size:11px;color:#64748b;line-height:1.5;margin-top:4px}
  table{width:100%;border-collapse:collapse}th{background:#f1f5f9;padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.6px}td{padding:11px 12px;border-bottom:1px solid #cbd5e1;font-size:12px}.amount{text-align:right}.small{font-size:10px;color:#64748b;margin-top:4px}.total td{background:#0D4BA0;color:#fff;font-size:16px;font-weight:900;border:0}.finance{margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:8px}.finance .ref{background:#f8fafc}.footer{position:absolute;left:16mm;right:16mm;bottom:10mm;border-top:1px solid #cbd5e1;padding-top:7mm;display:flex;justify-content:space-between;font-size:9px;color:#64748b}
  @media screen{.page{box-shadow:0 8px 30px rgba(15,23,42,.18)}}
</style></head><body><main class="page">
<header class="header"><div class="brand"><img class="logo" src="${escapeHtml(`${window.location.origin}/logo.png`)}" alt="Athoo logo"><div><div class="brand-name">ATHOO</div><div class="brand-sub">Home Services · Pakistan</div></div></div><div class="meta"><div class="title">OFFICIAL INVOICE</div><div class="number">${escapeHtml(inv.invoiceNumber)}</div><div class="status">${escapeHtml(inv.status)}</div></div></header>
<section class="body">
<div class="refs"><div class="ref"><div class="label">Job number</div><div class="value">${escapeHtml(jobNumber)}</div></div><div class="ref"><div class="label">Issued</div><div class="value">${escapeHtml(formatDate(inv.createdAt))}</div></div><div class="ref"><div class="label">Completed</div><div class="value">${escapeHtml(inv.jobCompletedAt ? formatDate(inv.jobCompletedAt) : `${inv.scheduledDate} ${inv.scheduledTime}`)}</div></div></div>
<div class="parties"><div class="party"><div class="label">Customer</div><strong>${escapeHtml(inv.customerName)}</strong><div class="detail">${escapeHtml(inv.address || "—")}</div></div><div class="party"><div class="label">Provider</div><strong>${escapeHtml(inv.providerName)}</strong><div class="detail">${escapeHtml(inv.service.replace(/_/g, " "))}</div></div></div>
<table><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody>
<tr><td><strong>${escapeHtml(inv.service.replace(/_/g, " "))}</strong><div class="small">${rate > 0 && duration > 0 ? `Rs. ${rate.toLocaleString()} / hour × ${duration} minute(s)` : "Recorded service amount"}</div></td><td class="amount">Rs. ${serviceAmount.toLocaleString()}</td></tr>
${visitCharge > 0 ? `<tr><td>Visit / travelling charge</td><td class="amount">Rs. ${visitCharge.toLocaleString()}</td></tr>` : ""}
${inv.discountAmount > 0 ? `<tr><td>Discount</td><td class="amount">−Rs. ${inv.discountAmount.toLocaleString()}</td></tr>` : ""}
<tr class="total"><td>TOTAL</td><td class="amount">Rs. ${Number(inv.totalAmount || 0).toLocaleString()}</td></tr></tbody></table>
<div class="finance"><div class="ref"><div class="label">Athoo commission</div><div class="value">Rs. ${Number(inv.commissionAmount || 0).toLocaleString()}</div></div><div class="ref"><div class="label">Provider amount</div><div class="value">Rs. ${Number(inv.providerAmount || 0).toLocaleString()}</div></div></div>
</section><footer class="footer"><div><strong>Athoo · Home Services Pakistan</strong><br>Support: official@athoo.pk · athoo.pk</div><div>Official marketplace invoice<br>Generated ${escapeHtml(new Date().toLocaleString("en-PK"))}</div></footer></main></body></html>`;
  }

  function printInvoice(inv: Invoice) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0",
    });
    frame.srcdoc = buildInvoiceHtml(inv);
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1_500);
    };
    document.body.appendChild(frame);
  }

  function exportCSV() {
    const rows = [
      ["Invoice No", "Customer", "Provider", "Service", "Date", "Total", "Commission", "Provider Amount", "Status", "Created"],
      ...filtered.map(inv => [
        inv.invoiceNumber, inv.customerName, inv.providerName, inv.service,
        inv.scheduledDate, inv.totalAmount, inv.commissionAmount, inv.providerAmount,
        inv.status, inv.createdAt,
      ]),
    ];
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `invoices-${today()}.csv`;
    a.click();
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Invoices", value: invoices.length, color: "text-slate-700", bg: "bg-slate-100" },
          { label: "Issued", value: invoices.filter(i => i.status === "issued").length, color: "text-amber-700", bg: "bg-amber-100" },
          { label: "Total Revenue", value: currency(totalRevenue), color: "text-emerald-700", bg: "bg-emerald-100" },
          { label: "Platform Commission", value: currency(totalCommission), color: "text-blue-700", bg: "bg-blue-100" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-600 font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search invoice number, customer, provider, service..."
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
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium">
              <Download size={15} /> Export CSV
            </button>
          </div>
          {(search || statusFilter !== "all") && (
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                <X size={12} /> Clear filters
              </button>
              <span className="text-xs text-slate-400 ml-auto">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Table */}
        {loadError ? (
          <div className="py-10 px-5 text-center text-sm text-red-600 bg-red-50">
            Failed to load invoices: {loadError}
            <button onClick={load} className="ml-3 underline text-red-700 hover:text-red-900">Retry</button>
          </div>
        ) : loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading invoices...</div>
        ) : paged.length === 0 ? (
          <div className="py-20 text-center">
            <FileText size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No invoices match your filters.</p>
            {invoices.length === 0 && !loading && (
              <p className="text-slate-300 text-xs mt-1">Invoices are created automatically when a booking is completed.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Service</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Provider</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Commission</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs font-bold text-blue-700">{inv.invoiceNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 capitalize">{inv.service.replace(/_/g, " ")}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[160px]">{inv.scheduledDate}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{inv.customerName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{inv.providerName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{currency(inv.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">{currency(inv.commissionAmount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50" onClick={() => setSelected(inv)}>
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
            {filtered.length === 0 ? "0 invoices" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} invoices`}
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

      {/* Invoice Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Invoice</p>
                <h3 className="text-lg font-bold text-blue-700 font-mono">{selected.invoiceNumber}</h3>
                <p className="text-xs text-slate-400 capitalize mt-0.5">{selected.service.replace(/_/g, " ")}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={selected.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Customer", selected.customerName],
                  ["Provider", selected.providerName],
                  ["Service", selected.service.replace(/_/g, " ")],
                  ["Job Number", selected.bookingPublicId || selected.bookingId],
                  ["Scheduled", `${selected.scheduledDate} ${selected.scheduledTime}`],
                  ["Hourly Rate", selected.ratePerHour ? `${currency(selected.ratePerHour)} / hour` : "—"],
                  ["Worked Time", selected.durationMinutes ? `${selected.durationMinutes} minutes` : "—"],
                  ["Service Amount", currency(selected.subtotal)],
                  ["Visit Charge", currency(selected.visitCharge)],
                  ["Platform Fee", currency(selected.platformFee)],
                  ["Discount", currency(selected.discountAmount)],
                  ["Commission", currency(selected.commissionAmount)],
                  ["Provider Earns", currency(selected.providerAmount)],
                  ["Created", formatDate(selected.createdAt)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-sm font-medium text-slate-800 break-words">{String(val)}</p>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Total Amount</span>
                <span className="text-xl font-black text-blue-700">{currency(selected.totalAmount)}</span>
              </div>

              {selected.address && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1">Address</p>
                  <p className="text-sm text-slate-700">{selected.address}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => printInvoice(selected)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  <Printer size={15} /> Print / Download PDF
                </button>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Adjust Status</p>
                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={adjustStatus || selected.status}
                    onChange={(e) => setAdjustStatus(e.target.value)}
                  >
                    <option value="issued">Issued</option>
                    <option value="paid">Paid</option>
                    <option value="disputed">Disputed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <input
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    placeholder="Reason (required for dispute/cancel/reopen)"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                  />
                  <button
                    onClick={handleAdjustStatus}
                    disabled={adjusting || !adjustStatus || adjustStatus === selected.status}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40"
                  >
                    <CheckCircle size={14} /> {adjusting ? "Saving…" : "Apply"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
