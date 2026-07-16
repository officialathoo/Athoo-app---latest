import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { apiErrorToMessage } from "@/lib/apiError";
import { invoiceConfig } from "@/config/invoice";

export type InvoiceBookingLike = {
  id: string;
  publicId?: string | null;
  service?: string | null;
  serviceLabel?: string | null;
  serviceIcon?: string | null;
  providerName?: string | null;
  customerName?: string | null;
  address?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  createdAt?: string | number | Date | null;
  price?: number | null;
  visitCharge?: number | null;
  commissionAmount?: number | null;
  status?: string | null;
};

function fmtDate(d?: string | number | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function invoiceNo(b: InvoiceBookingLike): string {
  if (b.publicId) return b.publicId;
  return `INV-${b.id.slice(-8).toUpperCase()}`;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(
  b: InvoiceBookingLike,
  role: "customer" | "provider"
): string {
  const no = invoiceNo(b);
  const service = b.service || b.serviceLabel || "Service";
  const serviceAmount = Number(b.price || 0);
  const visitCharge = Number(b.visitCharge || 0);
  const commission = Number(b.commissionAmount || 0);
  const total = serviceAmount + visitCharge;
  const netToProvider = total - commission;
  const isPaid = b.status === "completed" || b.status === "paid";
  const badge = isPaid ? "✓ PAID" : (b.status || "PENDING").toUpperCase();

  const printColors = invoiceConfig.colors;
  const invoiceFooter = [invoiceConfig.brandName, invoiceConfig.contactLine].filter(Boolean).join(" · ");

  const providerRows =
    role === "provider"
      ? `
      <tr><td style="color:${printColors.danger}">Athoo Commission</td><td class="amount" style="color:${printColors.danger}">−Rs. ${commission.toLocaleString()}</td></tr>
      <tr class="total-row"><td>NET TO PROVIDER</td><td class="amount">Rs. ${netToProvider.toLocaleString()}</td></tr>`
      : `<tr class="total-row"><td>TOTAL</td><td class="amount">Rs. ${total.toLocaleString()}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;color:${printColors.text};background:${printColors.background}}
  .page{max-width:700px;margin:0 auto;background:${printColors.page};border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
  .header{background:linear-gradient(135deg,${printColors.primary},${printColors.primaryPressed});color:${printColors.page};padding:28px 30px;display:flex;justify-content:space-between;align-items:flex-start}
  .logo{font-size:24px;font-weight:900;letter-spacing:-1px}
  .logo-sub{font-size:11px;opacity:.75;margin-top:2px}
  .inv-meta{text-align:right}
  .inv-no{font-size:18px;font-weight:700}
  .inv-date{font-size:12px;opacity:.8;margin-top:4px}
  .paid-badge{background:rgba(255,255,255,0.25);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;margin-top:8px;display:inline-block}
  .body{padding:28px 30px}
  .parties{display:flex;gap:30px;margin-bottom:24px}
  .party{flex:1;background:${printColors.background};border-radius:10px;padding:14px 16px}
  .party-label{font-size:10px;color:${printColors.textMuted};font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .party-name{font-size:15px;font-weight:700;color:${printColors.text};margin-bottom:3px}
  .party-detail{font-size:12px;color:${printColors.textSecondary}}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:${printColors.surface};font-size:11px;color:${printColors.textSecondary};text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;text-align:left;font-weight:700}
  td{padding:11px 12px;font-size:13px;border-bottom:1px solid ${printColors.surface}}
  .amount{text-align:right}
  .total-row{background:linear-gradient(135deg,${printColors.primary},${printColors.primaryPressed});color:${printColors.page}}
  .total-row td{font-weight:700;font-size:15px;padding:14px 12px}
  .note{background:${printColors.infoSoft};border:1px solid ${printColors.infoBorder};border-radius:8px;padding:12px 14px;font-size:12px;color:${printColors.info};margin-bottom:20px}
  .footer{text-align:center;font-size:11px;color:${printColors.textMuted};padding:0 0 8px}
</style></head><body>
<div class="page">
  <div class="header">
    <div><div class="logo">${esc(invoiceConfig.brandName)}</div><div class="logo-sub">Home Services · Across Pakistan</div></div>
    <div class="inv-meta"><div class="inv-no">${esc(no)}</div><div class="inv-date">${esc(fmtDate(b.createdAt))}</div><div class="paid-badge">${esc(badge)}</div></div>
  </div>
  <div class="body">
    <div class="parties">
      <div class="party"><div class="party-label">Billed To</div><div class="party-name">${esc(b.customerName ?? "")}</div><div class="party-detail">${esc(b.address ?? "")}</div></div>
      <div class="party"><div class="party-label">Service By</div><div class="party-name">${esc(b.providerName ?? "")}</div><div class="party-detail">${esc(service)}</div></div>
    </div>
    <table>
      <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
      <tr><td>${esc(service)}<br><small style="color:${printColors.textSecondary}">${esc(b.scheduledDate ?? "")} · ${esc(b.scheduledTime ?? "")}</small></td><td class="amount">Rs. ${serviceAmount.toLocaleString()}</td></tr>
      ${visitCharge > 0 ? `<tr><td>Visit / Call-out Charge<br><small style="color:${printColors.textSecondary}">Fixed visit fee</small></td><td class="amount">Rs. ${visitCharge.toLocaleString()}</td></tr>` : ""}
      <tr><td style="color:${printColors.textSecondary}">Subtotal</td><td class="amount" style="color:${printColors.textSecondary}">Rs. ${total.toLocaleString()}</td></tr>
      ${providerRows}
    </table>
    <div class="note">Payment is made directly in cash to the service provider. Athoo does not handle funds. This is an electronic ${isPaid ? "receipt" : "summary"} only.</div>
    <div class="footer">${esc(invoiceFooter)}${invoiceFooter ? " · " : ""}Thank you for using ${esc(invoiceConfig.brandName)}!</div>
  </div>
</div>
</body></html>`;
}

export async function shareBookingInvoice(
  booking: InvoiceBookingLike,
  opts?: { role?: "customer" | "provider"; onState?: (busy: boolean) => void }
): Promise<void> {
  const role = opts?.role ?? "customer";
  const no = invoiceNo(booking);
  const html = buildHtml(booking, role);

  try {
    opts?.onState?.(true);
    if (Platform.OS === "web") {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }
      return;
    }
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Invoice ${no}`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("Saved", `Invoice saved to: ${uri}`);
    }
  } catch (e: any) {
    Alert.alert("Unable to create invoice", apiErrorToMessage(e, "We couldn't create the invoice PDF. Please try again."));
  } finally {
    opts?.onState?.(false);
  }
}
