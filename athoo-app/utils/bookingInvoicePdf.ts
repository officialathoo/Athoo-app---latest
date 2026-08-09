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
  ratePerHour?: number | null;
  durationMinutes?: number | null;
  jobStartedAt?: string | number | Date | null;
  jobCompletedAt?: string | number | Date | null;
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
  return `PKR ${Number.isFinite(amount) ? amount.toLocaleString("en-PK") : "0"}`;
}

function smallNumberToWords(value: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
    "Eighty", "Ninety",
  ];
  if (value < 20) return ones[value];
  if (value < 100) {
    return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  }
  return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${smallNumberToWords(value % 100)}` : ""}`;
}

function amountInWords(value: number): string {
  const totalPaisa = Math.max(0, Math.round(Number(value || 0) * 100));
  const amount = Math.floor(totalPaisa / 100);
  const paisa = totalPaisa % 100;

  const groups: Array<[number, string]> = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];

  const integerWords = (integerValue: number): string => {
    if (integerValue === 0) return "Zero";
    let remaining = integerValue;
    const parts: string[] = [];
    for (const [size, label] of groups) {
      if (remaining >= size) {
        const count = Math.floor(remaining / size);
        parts.push(`${smallNumberToWords(count)} ${label}`);
        remaining %= size;
      }
    }
    if (remaining > 0) parts.push(smallNumberToWords(remaining));
    return parts.join(" ");
  };

  const rupeesText = `${integerWords(amount)} Rupees`;
  const paisaText = paisa > 0 ? ` and ${smallNumberToWords(paisa)} Paisa` : "";
  return `${rupeesText}${paisaText} Only`;
}

function displayUrl(value: string): string {
  const normalized = String(value || "");
  const withoutProtocol = normalized.startsWith("https://")
    ? normalized.slice(8)
    : normalized.startsWith("http://")
      ? normalized.slice(7)
      : normalized;
  return withoutProtocol.endsWith("/") ? withoutProtocol.slice(0, -1) : withoutProtocol;
}

async function resolveInvoiceRecord(
  booking: InvoiceBookingLike,
): Promise<InvoiceBookingLike> {
  if (booking.invoiceNumber && booking.verification?.qrCodeDataUri) return booking;
  try {
    const response = await api.getInvoiceForBooking(booking.id);
    const invoice = response.invoice;
    return {
      ...booking,
      publicId: booking.publicId,
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
      ratePerHour: booking.ratePerHour,
      durationMinutes: booking.durationMinutes,
      jobStartedAt: booking.jobStartedAt,
      jobCompletedAt: booking.jobCompletedAt,
      status: invoice.status,
      verification: invoice.verification,
    };
  } catch {
    return booking;
  }
}

function buildHtml(
  b: InvoiceBookingLike,
  role: "customer" | "provider",
): string {
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
  const ratePerHour = Math.max(0, Number(b.ratePerHour || 0));
  const startedAtMs = b.jobStartedAt ? new Date(b.jobStartedAt).getTime() : Number.NaN;
  const completedAtMs = b.jobCompletedAt ? new Date(b.jobCompletedAt).getTime() : Number.NaN;
  const derivedDurationMinutes =
    Number.isFinite(startedAtMs) &&
    Number.isFinite(completedAtMs) &&
    completedAtMs >= startedAtMs
      ? Math.round((completedAtMs - startedAtMs) / 60_000)
      : 0;
  const durationMinutes = Math.max(
    0,
    Number(b.durationMinutes || derivedDurationMinutes || 0),
  );
  const normalizedStatus = String(b.status || "issued").toLowerCase();
  const isPaid = normalizedStatus === "paid";
  const badge = isPaid ? "PAID" : normalizedStatus.toUpperCase();
  const verificationUrl = b.verification?.verificationUrl || "";
  const qrCodeDataUri = b.verification?.qrCodeDataUri || "";
  const isVerifiedInvoice = Boolean(b.invoiceNumber && verificationUrl && qrCodeDataUri);
  const documentTitle = isVerifiedInvoice ? "INVOICE" : "BOOKING SUMMARY";
  const bookingReference = b.publicId || b.id;
  const colors = invoiceConfig.colors;

  const durationHoursLabel = durationMinutes > 0
    ? `${(durationMinutes / 60).toFixed(durationMinutes % 60 === 0 ? 0 : 2)} hr`
    : "";
  const rateDetail = ratePerHour > 0
    ? `Booking rate: ${money(ratePerHour)}/hr${durationHoursLabel ? ` | Recorded work: ${durationHoursLabel}` : ""}`
    : "Confirmed service work";
  const quantity = "1";
  const unitPrice = money(serviceAmount);

  const itemRows = [
    `<tr><td class="center">1</td><td><strong>${esc(service)}</strong><div class="muted">${esc(rateDetail)}</div></td><td class="center">${esc(quantity)}</td><td class="amount">${unitPrice}</td><td class="amount">${money(serviceAmount)}</td></tr>`,
    visitCharge > 0
      ? `<tr><td class="center">2</td><td><strong>Arrival / Travel Charge</strong><div class="muted">Confirmed visit charge</div></td><td class="center">1</td><td class="amount">${money(visitCharge)}</td><td class="amount">${money(visitCharge)}</td></tr>`
      : "",
    discount > 0
      ? `<tr><td class="center">${visitCharge > 0 ? 3 : 2}</td><td><strong>Discount</strong></td><td class="center">1</td><td class="amount">&minus;${money(discount)}</td><td class="amount">&minus;${money(discount)}</td></tr>`
      : "",
  ].filter(Boolean).join("");

  const providerStatement = role === "provider"
    ? `<div class="provider-statement"><div><span>Athoo commission</span><strong class="danger">&minus;${money(commission)}</strong></div><div class="provider-net"><span>NET TO PROVIDER</span><strong>${money(netToProvider)}</strong></div></div>`
    : "";

  const supportRows = [
    invoiceConfig.contacts.email
      ? `<div><span>Email</span><strong>${esc(invoiceConfig.contacts.email)}</strong></div>`
      : "",
    invoiceConfig.contacts.websiteDisplay
      ? `<div><span>Website</span><strong>${esc(invoiceConfig.contacts.websiteDisplay)}</strong></div>`
      : "",
    invoiceConfig.contacts.phoneDisplay
      ? `<div><span>Support</span><strong>${esc(invoiceConfig.contacts.phoneDisplay)}</strong></div>`
      : "",
  ].filter(Boolean).join("");

  const socialText = invoiceConfig.socialLinks
    .map((entry) => `${entry.label}: ${displayUrl(entry.url)}`)
    .join(" | ");

  const qrBlock = isVerifiedInvoice
    ? `<div class="qr-box"><img src="${esc(qrCodeDataUri)}" alt="Invoice verification QR"><div><strong>SCAN TO VERIFY</strong><span>${esc(no)}</span><small>Opens the signed official Athoo verification record.</small></div></div>`
    : `<div class="qr-box pending"><div class="qr-placeholder">QR</div><div><strong>VERIFICATION PENDING</strong><span>${esc(no)}</span><small>A signed QR is attached after the completed invoice is issued.</small></div></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{size:210mm 297mm;margin:5mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:${colors.text};font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:100%;margin:0 auto;background:${colors.page};border:1px solid ${colors.navy};border-radius:14px;overflow:hidden;padding:15px}
.header{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand img{width:58px;height:58px;object-fit:contain}
.brand-name{font-size:28px;font-weight:900;color:${colors.navy};line-height:1}
.brand-sub{font-size:11px;font-weight:700;color:${colors.textSecondary};margin-top:5px}
.brand-desc{font-size:10px;color:${colors.textSecondary};margin-top:2px}
.invoice-box{min-width:218px;background:linear-gradient(135deg,${colors.navy},${colors.primaryPressed});border-radius:13px;padding:11px 14px;text-align:center;color:#fff}
.invoice-title{font-size:25px;font-weight:900;letter-spacing:.8px}
.invoice-number{font-size:12px;font-weight:900;color:${colors.secondary};margin-top:4px}
.invoice-date{font-size:9px;margin-top:4px;color:rgba(255,255,255,.86)}
.status{display:inline-block;margin-top:5px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.14);font-size:8.5px;font-weight:800}
.rule{height:1px;background:${colors.border};margin:10px 0}
.steps{display:flex;justify-content:space-between;gap:6px;align-items:flex-start;margin:1px 0 5px}
.step{width:19%;text-align:center;color:${colors.navy};font-size:8.8px;font-weight:800}
.step-num{width:21px;height:21px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;background:${colors.infoSoft};border:1px solid ${colors.infoBorder};color:${colors.primary};font-size:8.5px;font-weight:900}
.benefits{text-align:center;font-size:9.5px;font-weight:800;color:${colors.navy};margin:5px 0 9px}
.benefits b{color:${colors.secondary};padding:0 8px}
.info-grid{display:flex;gap:10px;margin-bottom:10px}
.panel{flex:1;border:1px solid ${colors.border};border-radius:11px;padding:10px}
.panel-title{font-size:10.5px;font-weight:900;color:${colors.primary};letter-spacing:.25px;margin-bottom:7px}
.panel-title.orange{color:${colors.secondaryPressed}}
.detail{display:grid;grid-template-columns:100px 1fr;gap:5px;font-size:9px;line-height:1.3;margin:3px 0}
.detail span{color:${colors.textSecondary};font-weight:700}
.detail strong{font-weight:800;overflow-wrap:anywhere}
.offer{margin-top:8px;background:linear-gradient(135deg,${colors.navy},${colors.primaryPressed});color:#fff;border-radius:9px;padding:8px}
.offer-title{font-size:9.5px;color:${colors.secondary};font-weight:900;margin-bottom:5px}
.offer-row{display:flex;justify-content:space-between;gap:8px;font-size:8.8px;margin:3px 0}
.offer-total{border-top:1px solid rgba(255,255,255,.32);margin-top:5px;padding-top:5px;font-size:9.5px;font-weight:900}
.offer-total strong{color:${colors.secondary};font-size:11px}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid ${colors.border};border-radius:10px;overflow:hidden;font-size:9px}
thead th{background:${colors.navy};color:#fff;padding:7px 6px;font-size:8px;letter-spacing:.3px}
tbody td{padding:7px 6px;border-bottom:1px solid ${colors.border};vertical-align:top}
tbody tr:last-child td{border-bottom:0}
.center{text-align:center}
.amount{text-align:right;white-space:nowrap}
.muted{font-size:7.5px;color:${colors.textMuted};margin-top:2px}
.summary{display:flex;gap:10px;margin-top:9px}
.notes{flex:1;border:1px solid ${colors.border};border-radius:10px;padding:9px}
.notes-title{font-size:9.5px;font-weight:900;color:${colors.primary};margin-bottom:4px}
.notes p{font-size:8px;line-height:1.28;color:${colors.textSecondary};margin:2.5px 0}
.totals{width:42%;border:1px solid ${colors.border};border-radius:10px;overflow:hidden}
.total-line{display:flex;justify-content:space-between;padding:6px 9px;font-size:8.8px}
.grand-total{display:flex;justify-content:space-between;padding:8px 9px;background:${colors.secondary};color:${colors.navy};font-size:10.5px;font-weight:900}
.words{padding:6px 9px;font-size:7.8px;line-height:1.3}
.provider-statement{margin-top:12px;border:1px solid ${colors.border};border-radius:12px;overflow:hidden}
.provider-statement>div{display:flex;justify-content:space-between;padding:9px 12px;font-size:10px}
.provider-net{background:${colors.navy};color:#fff;font-weight:900}
.danger{color:${colors.danger}}
.verify-note{margin-top:9px;padding:6px 9px;border-radius:8px;background:${colors.infoSoft};border:1px solid ${colors.infoBorder};font-size:7.8px;line-height:1.3;color:${colors.info}}
.footer{margin-top:9px;background:linear-gradient(135deg,${colors.navy},${colors.primaryPressed});border-radius:11px;color:#fff;padding:9px;display:grid;grid-template-columns:1fr 1.3fr;gap:10px;align-items:center}
.help-title{color:${colors.secondary};font-size:10px;font-weight:900;margin-bottom:4px}
.help-row{font-size:7.6px;margin:2px 0;display:flex;justify-content:space-between;gap:6px}
.help-row span{color:rgba(255,255,255,.7)}
.socials{font-size:7px;line-height:1.25;color:rgba(255,255,255,.76);margin-top:4px}
.qr-box{display:flex;gap:8px;align-items:center;border-left:1px solid rgba(255,255,255,.2);padding-left:10px}
.qr-box img,.qr-placeholder{width:78px;height:78px;background:#fff;border-radius:6px;padding:4px;object-fit:contain;flex:0 0 auto}
.qr-placeholder{display:flex;align-items:center;justify-content:center;color:${colors.navy};font-size:23px;font-weight:900}
.qr-box strong{display:block;color:${colors.secondary};font-size:11px}
.qr-box span{display:block;font-size:9px;font-weight:800;margin-top:4px}
.qr-box small{display:block;font-size:7.8px;line-height:1.35;color:rgba(255,255,255,.72);margin-top:5px}
.legal{text-align:center;font-size:6.8px;line-height:1.25;color:${colors.textMuted};margin-top:6px}
.header,.steps,.info-grid,.summary,.provider-statement,.footer{break-inside:avoid;page-break-inside:avoid}
@media(max-width:650px){.header,.info-grid,.summary{display:block}.invoice-box{margin-top:14px}.panel,.totals{width:100%;margin-top:10px}.footer{grid-template-columns:1fr}.qr-box{border-left:0;border-top:1px solid rgba(255,255,255,.2);padding-left:0;padding-top:12px}}
</style>
</head>
<body>
<main class="page">
  <header class="header">
    <div class="brand">
      <img src="${invoiceLogoDataUri}" alt="Athoo logo">
      <div>
        <div class="brand-name">${esc(invoiceConfig.brandName)}</div>
        <div class="brand-sub">${esc(invoiceConfig.descriptor)} &middot; Across Pakistan</div>
        <div class="brand-desc">Professional on-demand service marketplace</div>
      </div>
    </div>
    <div class="invoice-box">
      <div class="invoice-title">${documentTitle}</div>
      <div class="invoice-number">${isVerifiedInvoice ? "#" : "Reference: "}${esc(no)}</div>
      <div class="invoice-date">Issued: ${esc(fmtDate(b.createdAt))}</div>
      <div class="status">${esc(badge)}</div>
    </div>
  </header>

  <div class="rule"></div>

  <section class="steps">
    <div class="step"><div class="step-num">1</div>Book</div>
    <div class="step"><div class="step-num">2</div>Compare Offers</div>
    <div class="step"><div class="step-num">3</div>Choose Best</div>
    <div class="step"><div class="step-num">4</div>Work Done</div>
    <div class="step"><div class="step-num">5</div>You Pay</div>
  </section>
  <div class="benefits">Fast <b>&bull;</b> Reliable <b>&bull;</b> Verified Professionals</div>

  <section class="info-grid">
    <div class="panel">
      <div class="panel-title">CUSTOMER DETAILS</div>
      <div class="detail"><span>Customer Name</span><strong>${esc(b.customerName || "Customer")}</strong></div>
      <div class="detail"><span>Address</span><strong>${esc(b.address || "Address recorded in booking")}</strong></div>
      <div class="detail"><span>Booking ID</span><strong>${esc(bookingReference)}</strong></div>
      <div class="detail"><span>Service Date</span><strong>${esc(b.scheduledDate || "-")}</strong></div>
      <div class="detail"><span>Service Time</span><strong>${esc(b.scheduledTime || "-")}</strong></div>
    </div>

    <div class="panel">
      <div class="panel-title orange">SERVICE PROVIDER DETAILS</div>
      <div class="detail"><span>Professional Name</span><strong>${esc(b.providerName || "Athoo Provider")}</strong></div>
      <div class="detail"><span>Service Type</span><strong>${esc(service)}</strong></div>
      <div class="detail"><span>Service Location</span><strong>${esc(b.address || "Recorded booking location")}</strong></div>
      <div class="offer">
        <div class="offer-title">OFFER ACCEPTED</div>
        <div class="offer-row"><span>Service Charge</span><strong>${money(serviceAmount)}</strong></div>
        <div class="offer-row"><span>Arrival / Travel Charge</span><strong>${money(visitCharge)}</strong></div>
        <div class="offer-row offer-total"><span>Total Agreed Amount</span><strong>${money(total)}</strong></div>
      </div>
    </div>
  </section>

  <table>
    <thead>
      <tr><th>SR.</th><th>DESCRIPTION</th><th>QTY.</th><th class="amount">UNIT PRICE (PKR)</th><th class="amount">AMOUNT (PKR)</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <section class="summary">
    <div class="notes">
      <div class="notes-title">IMPORTANT NOTES</div>
      <p>Thank you for using ${esc(invoiceConfig.brandName)}. We appreciate your trust in our service.</p>
      <p>Keep this invoice for your records. Verify authenticity through the signed QR before relying on a screenshot or forwarded copy.</p>
      <p>${esc(invoiceConfig.brandName)} never asks for passwords, OTPs, completion PINs or card details through an invoice.</p>
      <p>This electronic invoice intentionally excludes customer and provider mobile numbers.</p>
    </div>
    <div class="totals">
      <div class="total-line"><span>Sub Total</span><strong>${money(serviceAmount + visitCharge)}</strong></div>
      <div class="total-line"><span>Discount</span><strong>${money(discount)}</strong></div>
      <div class="grand-total"><span>TOTAL AMOUNT</span><strong>${money(total)}</strong></div>
      <div class="words"><strong>Amount in Words:</strong><br>${esc(amountInWords(total))}</div>
    </div>
  </section>

  ${providerStatement}

  <div class="verify-note">
    Payment is made directly according to the confirmed booking terms. The QR below is for invoice authenticity verification only &mdash; it is not a payment QR.
  </div>

  <footer class="footer">
    <div>
      <div class="help-title">Need Help?</div>
      ${supportRows.replace(/<div>/g, '<div class="help-row">').replace(/<span>/g, '<span>')}
      ${socialText ? `<div class="socials">${esc(socialText)}</div>` : ""}
    </div>
    ${qrBlock}
  </footer>

  <div class="legal">
    Electronically generated by ${esc(invoiceConfig.brandName)} &middot; No handwritten signature required &middot; Customer/provider private phone numbers are not printed.
  </div>
</main>
</body>
</html>`;
}

export async function shareBookingInvoice(
  booking: InvoiceBookingLike,
  opts?: {
    role?: "customer" | "provider";
    onState?: (busy: boolean) => void;
  },
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

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
      width: 595.28,
      height: 841.89,
    });
    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Invoice ${no}`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert(
        "Invoice ready",
        "Your invoice was created and saved on this device.",
      );
    }
  } catch (error) {
    Alert.alert(
      "Unable to create invoice",
      apiErrorToMessage(
        error,
        "We couldn't create the invoice PDF. Please try again.",
      ),
    );
  } finally {
    opts?.onState?.(false);
  }
}
