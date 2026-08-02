import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { apiErrorToMessage } from "@/lib/apiError";
import { invoiceConfig } from "@/config/invoice";
import { invoiceLogoDataUri } from "@/config/invoiceLogoData";
import { api } from "@/services/api";

export type InvoiceBookingLike = {
  id: string;
  publicId?: string | null;
  invoiceNumber?: string | null;
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
  subtotal?: number | null;
  totalAmount?: number | null;
  visitCharge?: number | null;
  discountAmount?: number | null;
  commissionAmount?: number | null;
  providerAmount?: number | null;
  status?: string | null;
  verification?: {
    verificationUrl?: string | null;
    qrCodeDataUri?: string | null;
  } | null;
};

function fmtDate(d?: string | number | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fallbackInvoiceNo(b: InvoiceBookingLike): string {
  if (b.invoiceNumber) return b.invoiceNumber;
  if (b.publicId) return b.publicId;
  return `INV-${b.id.slice(-8).toUpperCase()}`;
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: unknown): string {
  const amount = Number(value || 0);
  return `Rs. ${Number.isFinite(amount) ? amount.toLocaleString("en-PK") : "0"}`;
}

async function resolveInvoiceRecord(booking: InvoiceBookingLike): Promise<InvoiceBookingLike> {
  if (booking.invoiceNumber && booking.verification?.qrCodeDataUri) return booking;
  try {
    const response = await api.getInvoiceForBooking(booking.id);
    const invoice = response.invoice;
    return {
      ...booking,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName || booking.customerName,
      providerName: invoice.providerName || booking.providerName,
      service: invoice.service || booking.service,
      address: invoice.address || booking.address,
      scheduledDate: invoice.scheduledDate || booking.scheduledDate,
      scheduledTime: invoice.scheduledTime || booking.scheduledTime,
      createdAt: invoice.createdAt || booking.createdAt,
      subtotal: invoice.subtotal,
      price: invoice.subtotal,
      visitCharge: invoice.visitCharge,
      totalAmount: invoice.totalAmount,
      discountAmount: invoice.discountAmount,
      commissionAmount: invoice.commissionAmount,
      providerAmount: invoice.providerAmount,
      status: invoice.status,
      verification: invoice.verification,
    };
  } catch {
    // Pending/in-progress jobs may not have an issued invoice yet. The PDF can
    // still be generated as an unverified booking summary without weakening
    // the real completed-invoice verification flow.
    return booking;
  }
}

function buildHtml(b: InvoiceBookingLike, role: "customer" | "provider"): string {
  const no = fallbackInvoiceNo(b);
  const service = b.service || b.serviceLabel || "Service";
  const visitCharge = Math.max(0, Number(b.visitCharge || 0));
  const subtotalFromInvoice = Number(b.subtotal || 0);
  const serviceAmount = Math.max(0, subtotalFromInvoice || Number(b.price || 0));
  const discount = Math.max(0, Number(b.discountAmount || 0));
  const calculatedTotal = Math.max(0, serviceAmount + visitCharge - discount);
  const total = Math.max(0, Number(b.totalAmount ?? calculatedTotal));
  const commission = Math.max(0, Number(b.commissionAmount || 0));
  const netToProvider = Math.max(0, Number(b.providerAmount ?? total - commission));
  const normalizedStatus = String(b.status || "issued").toLowerCase();
  const isPaid = normalizedStatus === "completed" || normalizedStatus === "paid";
  const badge = isPaid ? "✓ PAID" : normalizedStatus.toUpperCase();
  const verificationUrl = b.verification?.verificationUrl || "";
  const qrCodeDataUri = b.verification?.qrCodeDataUri || "";
  const isVerifiedInvoice = Boolean(b.invoiceNumber && verificationUrl && qrCodeDataUri);

  const colors = invoiceConfig.colors;
  const invoiceFooter = [invoiceConfig.brandName, invoiceConfig.contactLine].filter(Boolean).join(" · ");
  const providerRows = role === "provider"
    ? `<tr><td class="danger">Athoo commission</td><td class="amount danger">−${money(commission)}</td></tr>
       <tr class="total-row"><td>NET TO PROVIDER</td><td class="amount">${money(netToProvider)}</td></tr>`
    : `<tr class="total-row"><td>TOTAL</td><td class="amount">${money(total)}</td></tr>`;

  const verificationBlock = isVerifiedInvoice
    ? `<section class="verification">
        <div class="qr-wrap"><img class="qr" src="${esc(qrCodeDataUri)}" alt="Invoice verification QR code"></div>
        <div class="verification-copy"><div class="verify-title">SCAN TO VERIFY</div><div class="verify-id">Official verification: ${esc(no)}</div><p>Scan this QR code to confirm this invoice directly through the official Athoo system. The verification page hides private names, phone numbers, addresses and user IDs.</p><div class="verified-pill">✓ Digitally signed by Athoo</div></div>
      </section>`
    : `<section class="summary-warning"><strong>Booking summary only.</strong> A signed verification QR is added automatically after the completed job invoice is issued by Athoo.</section>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page{margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:${colors.text};background:${colors.background};-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:760px;margin:0 auto;background:${colors.page};border:1px solid ${colors.border};border-radius:18px;overflow:hidden}.topline{height:7px;background:linear-gradient(90deg,${colors.primary} 0 76%,#F97316 76%)}.header{padding:24px 28px;display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.brand{display:flex;align-items:center;gap:13px}.brand img{width:62px;height:62px;object-fit:contain}.brand-name{font-size:27px;font-weight:900;color:${colors.primaryPressed};letter-spacing:-1px}.brand-sub{font-size:11px;color:${colors.textSecondary};margin-top:3px;text-transform:uppercase;letter-spacing:1.1px}.inv-meta{text-align:right}.inv-label{font-size:10px;color:${colors.textMuted};font-weight:800;letter-spacing:1px}.inv-no{font-size:20px;font-weight:900;margin-top:4px}.inv-date{font-size:12px;color:${colors.textSecondary};margin-top:5px}.status{display:inline-block;margin-top:9px;border-radius:999px;padding:5px 11px;background:${isPaid ? colors.successSoft : colors.infoSoft};color:${isPaid ? colors.success : colors.info};font-size:11px;font-weight:800}.body{padding:0 28px 26px}.parties{display:flex;gap:16px;margin:4px 0 22px}.party{flex:1;background:${colors.background};border:1px solid ${colors.border};border-radius:12px;padding:14px 15px}.party-label{font-size:10px;color:${colors.textMuted};font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px}.party-name{font-size:15px;font-weight:800}.party-detail{font-size:12px;color:${colors.textSecondary};line-height:1.45;margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:18px}th{background:${colors.surface};font-size:10px;color:${colors.textSecondary};text-transform:uppercase;letter-spacing:.6px;padding:11px 12px;text-align:left}td{padding:12px;border-bottom:1px solid ${colors.surface};font-size:13px}.amount{text-align:right;white-space:nowrap}.danger{color:${colors.danger}}.total-row{background:linear-gradient(135deg,${colors.primary},${colors.primaryPressed});color:#fff}.total-row td{font-size:15px;font-weight:900;padding:14px 12px}.verification{display:flex;gap:18px;align-items:center;border:1px solid ${colors.infoBorder};background:${colors.infoSoft};border-radius:14px;padding:15px;margin-top:16px}.qr-wrap{background:#fff;border:1px solid ${colors.border};padding:6px;border-radius:10px;line-height:0}.qr{width:118px;height:118px}.verification-copy{flex:1}.verify-title{font-size:13px;font-weight:900;color:${colors.primaryPressed};letter-spacing:.7px}.verify-id{font-size:12px;font-weight:800;margin-top:5px}.verification-copy p{font-size:11px;line-height:1.5;color:${colors.textSecondary};margin:7px 0}.verified-pill{display:inline-block;border-radius:999px;padding:5px 9px;background:${colors.successSoft};color:${colors.success};font-size:10px;font-weight:800}.summary-warning{border:1px solid #FED7AA;background:#FFF7ED;color:#9A3412;border-radius:12px;padding:12px 14px;font-size:11px;line-height:1.5}.instructions{margin-top:15px;padding:13px 14px;border-left:4px solid #F97316;background:#FFF7ED;font-size:11px;line-height:1.55;color:#7C2D12}.instructions strong{display:block;margin-bottom:4px}.footer{text-align:center;margin-top:18px;padding-top:14px;border-top:1px solid ${colors.border};font-size:10px;line-height:1.55;color:${colors.textMuted}}
</style></head><body><main class="page"><div class="topline"></div><header class="header"><div class="brand"><img src="${invoiceLogoDataUri}" alt="Athoo logo"><div><div class="brand-name">${esc(invoiceConfig.brandName)}</div><div class="brand-sub">${esc(invoiceConfig.descriptor)} · Across Pakistan</div></div></div><div class="inv-meta"><div class="inv-label">INVOICE</div><div class="inv-no">${esc(no)}</div><div class="inv-date">Issued ${esc(fmtDate(b.createdAt))}</div><div class="status">${esc(badge)}</div></div></header><div class="body"><section class="parties"><div class="party"><div class="party-label">Billed to</div><div class="party-name">${esc(b.customerName || "Customer")}</div><div class="party-detail">${esc(b.address || "Address recorded in the Athoo booking")}</div></div><div class="party"><div class="party-label">Service by</div><div class="party-name">${esc(b.providerName || "Athoo Provider")}</div><div class="party-detail">${esc(service)}<br>${esc(b.scheduledDate || "")} ${b.scheduledTime ? `· ${esc(b.scheduledTime)}` : ""}</div></div></section><table><tr><th>Description</th><th class="amount">Amount</th></tr><tr><td>${esc(service)}<br><small style="color:${colors.textSecondary}">Service charge</small></td><td class="amount">${money(serviceAmount)}</td></tr>${visitCharge > 0 ? `<tr><td>Travelling / visit charge</td><td class="amount">${money(visitCharge)}</td></tr>` : ""}${discount > 0 ? `<tr><td>Discount</td><td class="amount">−${money(discount)}</td></tr>` : ""}<tr><td style="color:${colors.textSecondary}">Subtotal</td><td class="amount" style="color:${colors.textSecondary}">${money(total)}</td></tr>${providerRows}</table>${verificationBlock}<section class="instructions"><strong>Important anti-fraud instructions</strong>Do not trust edited screenshots or invoices without a successful QR verification. Athoo never asks for passwords, OTPs, completion PINs or card details through an invoice. Payments are made directly according to the confirmed booking terms; keep this invoice for your records.</section><footer class="footer">${esc(invoiceFooter)}${invoiceFooter ? "<br>" : ""}Thank you for choosing ${esc(invoiceConfig.brandName)}. This electronic document does not display customer or provider mobile numbers.</footer></div></main></body></html>`;
}

export async function shareBookingInvoice(
  booking: InvoiceBookingLike,
  opts?: { role?: "customer" | "provider"; onState?: (busy: boolean) => void },
): Promise<void> {
  const role = opts?.role ?? "customer";
  try {
    opts?.onState?.(true);
    const resolved = await resolveInvoiceRecord(booking);
    const no = fallbackInvoiceNo(resolved);
    const html = buildHtml(resolved, role);
    if (Platform.OS === "web") {
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (w) {
        w.opener = null;
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
      Alert.alert("Invoice ready", "Your invoice was created and saved on this device.");
    }
  } catch (e: any) {
    Alert.alert("Unable to create invoice", apiErrorToMessage(e, "We couldn't create the invoice PDF. Please try again."));
  } finally {
    opts?.onState?.(false);
  }
}
