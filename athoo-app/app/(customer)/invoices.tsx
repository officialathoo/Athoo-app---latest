import { apiErrorToMessage } from "@/lib/apiError";
import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { brandConfig } from "@/config/brand";
import { invoiceConfig } from "@/config/invoice";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { api } from "@/services/api";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type ApiInvoice = {
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
};

export default function InvoicesScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [apiInvoices, setApiInvoices] = useState<ApiInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadInvoices = React.useCallback(async () => {
    setLoadingInvoices(true);
    setLoadError(null);
    try {
      const response = await api.getInvoices();
      setApiInvoices(response.invoices || []);
    } catch (error) {
      setLoadError(apiErrorToMessage(error, tr("We couldn't load your invoices. Please try again.")));
    } finally {
      setLoadingInvoices(false);
    }
  }, [tr]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const completed = useMemo(
    () => user
      ? getMyBookings(user.id, "customer").filter((booking) => booking.status === "completed")
      : [],
    [getMyBookings, user],
  );

  const selected = completed.find((b) => b.id === selectedInvoice);

  function getInvoiceNo(bookingId: string): string {
    const match = apiInvoices.find((i) => i.bookingId === bookingId);
    if (match) return match.invoiceNumber;
    const b = completed.find((x) => x.id === bookingId);
    return b ? `ATH-${b.id.slice(-6).toUpperCase()}` : "ATH-??????";
  }

  function getInvoiceAmounts(b: any) {
    const match = apiInvoices.find((i) => i.bookingId === b.id);
    const serviceAmount = Number(match?.subtotal ?? b.price ?? 0);
    const visitCharge = Number(match?.visitCharge ?? b.visitCharge ?? 0);
    const discount = Number(match?.discountAmount ?? 0);
    const totalAmount = Number(match?.totalAmount ?? Math.max(0, serviceAmount + visitCharge - discount));
    const ratePerHour = Number(match?.ratePerHour ?? b.ratePerHour ?? 0);
    const durationMinutes = Number(match?.durationMinutes ?? (
      ratePerHour > 0 ? Math.max(1, Math.round((serviceAmount / ratePerHour) * 60)) : 0
    ));
    return { match, serviceAmount, visitCharge, discount, totalAmount, ratePerHour, durationMinutes };
  }

  useEffect(() => {
    const requestedBookingId = typeof params.bookingId === "string" ? params.bookingId : "";
    if (requestedBookingId && completed.some((booking) => booking.id === requestedBookingId)) {
      setSelectedInvoice(requestedBookingId);
    }
  }, [params.bookingId, completed]);

  async function loadInvoiceLogoDataUri(): Promise<string> {
    try {
      const source = Image.resolveAssetSource(brandConfig.assets.mark);
      if (!source?.uri) return "";
      let uri = source.uri;
      if (/^https?:\/\//i.test(uri)) {
        const target = `${FileSystem.cacheDirectory || ""}athoo-invoice-logo.png`;
        const downloaded = await FileSystem.downloadAsync(uri, target);
        uri = downloaded.uri;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return base64 ? `data:image/png;base64,${base64}` : "";
    } catch {
      return "";
    }
  }

  const handleShare = async (b: any) => {
    await handleDownloadPdf(b);
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPdf = async (b: any) => {
    if (generatingPdf) return;
    const invoiceNo = getInvoiceNo(b.id);
    const { match, serviceAmount, visitCharge, discount, totalAmount, ratePerHour, durationMinutes } = getInvoiceAmounts(b);
    const jobNumber = match?.bookingPublicId || b.publicId || b.id;
    const logoDataUri = await loadInvoiceLogoDataUri();
    const statusLabel = String(match?.status || "issued").toUpperCase();
    const customerName = escapeHtml(b.customerName);
    const providerName = escapeHtml(b.providerName);
    const address = escapeHtml(b.address);
    const serviceName = escapeHtml(b.service);
    const direction = isUrdu ? "rtl" : "ltr";

    const printColors = invoiceConfig.colors;
    const invoiceFooter = [invoiceConfig.brandName, invoiceConfig.contactLine].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html><html dir="${direction}"><head><meta charset="utf-8">
<style>
  @page{size:A4;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:${printColors.canvas};color:${printColors.text};font-family:Arial,sans-serif;direction:${direction}}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:${printColors.page};position:relative;padding-bottom:34mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .header{min-height:48mm;background:linear-gradient(135deg,${printColors.primary},${printColors.primaryPressed});color:${printColors.page};padding:15mm 16mm 11mm;display:flex;justify-content:space-between;align-items:flex-start}
  .brand{display:flex;align-items:center;gap:12px}.brand img{width:52px;height:52px;border-radius:13px;background:${printColors.page};object-fit:contain;padding:4px}.brand-name{font-size:27px;font-weight:900;letter-spacing:-1px}.brand-sub{font-size:11px;opacity:.85;margin-top:3px}
  .meta{text-align:${isUrdu ? "left" : "right"}}.invoice-title{font-size:13px;letter-spacing:2px;font-weight:700;opacity:.8}.invoice-no{font-size:20px;font-weight:900;margin-top:4px}.status{display:inline-block;margin-top:8px;padding:5px 12px;border:1px solid rgba(255,255,255,.45);border-radius:999px;font-size:10px;font-weight:800}
  .body{padding:12mm 16mm}.refs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10mm}.ref{border:1px solid ${printColors.border};border-radius:8px;padding:9px}.label{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:${printColors.textMuted};font-weight:800}.value{font-size:12px;font-weight:700;margin-top:4px;word-break:break-word}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:9mm}.party{background:${printColors.background};border:1px solid ${printColors.border};border-radius:10px;padding:12px}.party-name{font-size:15px;font-weight:800;margin-top:5px}.party-detail{font-size:11px;line-height:1.5;color:${printColors.textSecondary};margin-top:4px}
  .formula{background:${printColors.infoSoft};border-left:4px solid ${printColors.primary};padding:10px 12px;font-size:11px;font-weight:700;margin-bottom:7mm}
  table{width:100%;border-collapse:collapse}th{background:${printColors.surface};padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:${printColors.textSecondary}}td{padding:11px 12px;border-bottom:1px solid ${printColors.border};font-size:12px}.amount{text-align:right}.total td{background:${printColors.primaryPressed};color:${printColors.page};font-size:16px;font-weight:900;border:0}.small{font-size:10px;color:${printColors.textSecondary};margin-top:4px}
  .note{margin-top:8mm;background:${printColors.successSoft};border:1px solid ${printColors.successBorder};border-radius:8px;padding:10px 12px;font-size:10px;line-height:1.5;color:${printColors.textSecondary}}
  .footer{position:absolute;left:16mm;right:16mm;bottom:10mm;border-top:1px solid ${printColors.border};padding-top:7mm;display:flex;justify-content:space-between;gap:15px;font-size:9px;color:${printColors.textMuted}}.footer strong{color:${printColors.text}}
  @media screen{.page{box-shadow:0 8px 30px rgba(15,23,42,.18)}}
</style></head><body><main class="page">
  <header class="header">
    <div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="Athoo logo">` : ""}<div><div class="brand-name">${escapeHtml(invoiceConfig.brandName)}</div><div class="brand-sub">${escapeHtml(invoiceConfig.descriptor)} · Pakistan</div></div></div>
    <div class="meta"><div class="invoice-title">INVOICE</div><div class="invoice-no">${escapeHtml(invoiceNo)}</div><div class="status">${escapeHtml(statusLabel)}</div></div>
  </header>
  <section class="body">
    <div class="refs">
      <div class="ref"><div class="label">Job number</div><div class="value">${escapeHtml(jobNumber)}</div></div>
      <div class="ref"><div class="label">Issued</div><div class="value">${escapeHtml(formatLocalizedDate(match?.createdAt || b.createdAt))}</div></div>
      <div class="ref"><div class="label">Completed</div><div class="value">${escapeHtml(formatLocalizedDate(match?.jobCompletedAt || b.jobCompletedAt || b.updatedAt || b.createdAt))}</div></div>
    </div>
    <div class="parties">
      <div class="party"><div class="label">Billed to</div><div class="party-name">${customerName}</div><div class="party-detail">${address}</div></div>
      <div class="party"><div class="label">Service provider</div><div class="party-name">${providerName}</div><div class="party-detail">${serviceName}</div></div>
    </div>
    <div class="formula">Service amount = agreed hourly rate ÷ 60 × actual worked minutes. Visit/travel charge is then added.</div>
    <table>
      <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        <tr><td><strong>${serviceName}</strong><div class="small">${escapeHtml(formatCurrency(ratePerHour))} per hour × ${durationMinutes} minute(s)</div></td><td class="amount">${escapeHtml(formatCurrency(serviceAmount))}</td></tr>
        ${visitCharge > 0 ? `<tr><td>Visit / travelling charge</td><td class="amount">${escapeHtml(formatCurrency(visitCharge))}</td></tr>` : ""}
        ${discount > 0 ? `<tr><td>Discount</td><td class="amount">−${escapeHtml(formatCurrency(discount))}</td></tr>` : ""}
        <tr class="total"><td>TOTAL</td><td class="amount">${escapeHtml(formatCurrency(totalAmount))}</td></tr>
      </tbody>
    </table>
    <div class="note">Payment is made directly between customer and provider. This invoice is the official Athoo job record and uses the agreed booking rate and recorded job duration.</div>
  </section>
  <footer class="footer"><div><strong>${escapeHtml(invoiceConfig.brandName)}</strong><br>${escapeHtml(invoiceConfig.descriptor)}</div><div>${escapeHtml(invoiceFooter || "Official Athoo service invoice")}</div></footer>
</main></body></html>`;

    try {
      setGeneratingPdf(true);
      if (Platform.OS === "web") {
        const frame = document.createElement("iframe");
        frame.style.position = "fixed";
        frame.style.right = "0";
        frame.style.bottom = "0";
        frame.style.width = "0";
        frame.style.height = "0";
        frame.style.border = "0";
        frame.srcdoc = html;
        frame.onload = () => {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          window.setTimeout(() => frame.remove(), 1_000);
        };
        document.body.appendChild(frame);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Invoice ${invoiceNo}` });
      } else {
        Alert.alert(tr("Invoice ready"), tr("Your invoice was saved and is ready to share."));
      }
    } catch (e: any) {
      Alert.alert(tr("Unable to create invoice"), apiErrorToMessage(e, tr("We couldn't create the invoice PDF. Please try again.")));
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (selected) {
    const { match, serviceAmount, visitCharge, discount, totalAmount, ratePerHour, durationMinutes } = getInvoiceAmounts(selected);
    const statusLabel = String(match?.status || "issued").toUpperCase();
    const jobNumber = match?.bookingPublicId || (selected as any).publicId || selected.id;

    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedInvoice(null)} accessibilityRole="button" accessibilityLabel={tr("Back")}>
            <Icon name={isUrdu ? "arrow-right" : "arrow-left"} size={20} color={theme.colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>{tr("Invoice Details")}</Text>
          <View style={{ flexDirection: isUrdu ? "row-reverse" : "row", gap: 8 }}>
            <Pressable style={styles.shareBtn} onPress={() => handleShare(selected)} disabled={generatingPdf}>
              <Icon name="share-2" size={18} color={theme.colors.primary} />
            </Pressable>
            <Pressable style={[styles.shareBtn, { backgroundColor: theme.colors.primary + "15" }]} onPress={() => handleDownloadPdf(selected)} disabled={generatingPdf}>
              {generatingPdf
                ? <Icon name="loader" size={18} color={theme.colors.primary} />
                : <Icon name="download" size={18} color={theme.colors.primary} />}
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.invoiceContent}>
          <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.invoiceHeader}>
            <View style={styles.invoiceLogo}>
              <Image source={brandConfig.assets.mark} style={{ width: 80, height: 32 }} resizeMode="contain" />
              <Text style={styles.invoiceSubhead}>{tr("Home Services · Pakistan")}</Text>
            </View>
            <View style={styles.invoiceHeaderRight}>
              <Text style={styles.invoiceNo}>{getInvoiceNo(selected.id)}</Text>
              <Text style={styles.invoiceDate}>{formatLocalizedDate(selected.createdAt)}</Text>
              <View style={styles.invoicePaidBadge}>
                <Icon name="check-circle" size={11} color={theme.colors.onBrand} />
                <Text style={styles.invoicePaidText}>{statusLabel}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.invoiceBody}>
            <View style={styles.invoiceMetaGrid}>
              <View style={styles.invoiceMetaItem}>
                <Text style={styles.partyLabel}>{tr("JOB NUMBER")}</Text>
                <Text style={styles.partyName}>{jobNumber}</Text>
              </View>
              <View style={styles.invoiceMetaItem}>
                <Text style={styles.partyLabel}>{tr("WORKED TIME")}</Text>
                <Text style={styles.partyName}>{durationMinutes} {tr("minutes")}</Text>
              </View>
              <View style={styles.invoiceMetaItem}>
                <Text style={styles.partyLabel}>{tr("AGREED RATE")}</Text>
                <Text style={styles.partyName}>{formatCurrency(ratePerHour)} / {tr("hour")}</Text>
              </View>
            </View>
            <View style={styles.invoiceParty}>
              <View style={styles.invoicePartyItem}>
                <Text style={styles.partyLabel}>{tr("BILLED TO")}</Text>
                <Text style={styles.partyName}>{selected.customerName}</Text>
                <Text style={styles.partyDetail}>{selected.address}</Text>
              </View>
              <View style={styles.invoicePartyItem}>
                <Text style={styles.partyLabel}>{tr("SERVICE BY")}</Text>
                <Text style={styles.partyName}>{selected.providerName}</Text>
                <Text style={styles.partyDetail}>{selected.service}</Text>
              </View>
            </View>

            <View style={styles.invoiceTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>{tr("Description")}</Text>
                <Text style={[styles.tableHeaderText, { textAlign: isUrdu ? "left" : "right" }]}>{tr("Amount")}</Text>
              </View>

              <View style={styles.tableRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tableRowLabel}>{selected.service}</Text>
                  <Text style={styles.tableRowSub}>{formatCurrency(ratePerHour)} / {tr("hour")} × {durationMinutes} {tr("minutes")}</Text>
                </View>
                <Text style={styles.tableRowAmount}>{formatCurrency(serviceAmount)}</Text>
              </View>

              {visitCharge > 0 && (
                <View style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableRowLabel}>{tr("Visit / Call-out Charge")}</Text>
                    <Text style={styles.tableRowSub}>{tr("Fixed visit fee")}</Text>
                  </View>
                  <Text style={styles.tableRowAmount}>{formatCurrency(visitCharge)}</Text>
                </View>
              )}

              <View style={styles.tableDivider} />

              <View style={styles.tableRow}>
                <Text style={[styles.tableRowLabel, { flex: 2 }]}>{tr("Subtotal")}</Text>
                <Text style={styles.tableRowAmount}>{formatCurrency(serviceAmount + visitCharge)}</Text>
              </View>

              {discount > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableRowLabel, { flex: 2, color: theme.colors.success }]}>{tr("Discount")}</Text>
                  <Text style={[styles.tableRowAmount, { color: theme.colors.success }]}>−{formatCurrency(discount)}</Text>
                </View>
              )}

              <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.totalRow}>
                <Text style={styles.totalLabel}>{tr("TOTAL")}</Text>
                <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
              </LinearGradient>
            </View>

            <View style={styles.invoiceNote}>
              <Icon name="info" size={13} color={theme.colors.textSecondary} />
              <Text style={styles.invoiceNoteText}>
                {tr("Payment was made directly to the service provider. Athoo does not handle funds. This is an electronic receipt only.")}
              </Text>
            </View>

            <View style={styles.invoiceFooter}>
              <Text style={styles.invoiceFooterText}>{[invoiceConfig.brandName, invoiceConfig.contactLine].filter(Boolean).join(" · ")}</Text>
              <Text style={styles.invoiceFooterText}>{tr("Thank you for using Athoo!")}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr("Back")}>
          <Icon name={isUrdu ? "arrow-right" : "arrow-left"} size={20} color={theme.colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>{tr("My Invoices")}</Text>
      </View>

      {loadingInvoices ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.errorState} accessibilityRole="alert">
          <Icon name="alert-circle" size={36} color={theme.colors.danger} />
          <Text style={styles.errorTitle}>{tr("Invoices unavailable")}</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={loadInvoices} accessibilityRole="button" accessibilityLabel={tr("Retry")}>
            <Text style={styles.retryText}>{tr("Retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {completed.length === 0 ? (
            <AnimatedCard>
              <View style={styles.empty}>
                <Icon name="file-text" size={36} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>{tr("No invoices yet")}</Text>
                <Text style={styles.emptySubtitle}>{tr("Invoices appear after service completion")}</Text>
              </View>
            </AnimatedCard>
          ) : (
            completed.map((b, i) => {
              const { totalAmount, match } = getInvoiceAmounts(b);
              return (
                <AnimatedCard key={b.id} delay={i * 60}>
                  <Pressable
                    style={({ pressed }) => [styles.invoiceCard, pressed && styles.pressed]}
                    onPress={() => setSelectedInvoice(b.id)}
                  >
                    <View style={styles.invoiceCardLeft}>
                      <View style={styles.invoiceIconBox}>
                        <Icon name="file-text" size={20} color={theme.colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.invoiceCardNo}>{getInvoiceNo(b.id)}</Text>
                        <Text style={styles.invoiceCardService}>{b.service}</Text>
                        <Text style={styles.invoiceCardDate}>{formatLocalizedDate(b.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={styles.invoiceCardRight}>
                      <Text style={styles.invoiceCardAmount}>{formatCurrency(totalAmount)}</Text>
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>{String(match?.status || "issued").toUpperCase()}</Text>
                      </View>
                      <Icon name="chevron-right" size={14} color={theme.colors.textMuted} />
                    </View>
                  </Pressable>
                </AnimatedCard>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: theme.colors.text },
  shareBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  listContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 20, gap: 12, paddingBottom: 80 },
  empty: { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  emptySubtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center" },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
  errorTitle: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  errorText: { maxWidth: 420, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary, textAlign: "center" },
  retryBtn: { minHeight: 44, minWidth: 120, marginTop: 6, borderRadius: 12, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary },
  retryText: { color: theme.colors.white, fontSize: 14, fontWeight: "700" },
  invoiceCard: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  pressed: { opacity: 0.85 },
  invoiceCardLeft: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, flex: 1 },
  invoiceIconBox: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  invoiceCardNo: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  invoiceCardService: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },
  invoiceCardDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  invoiceCardRight: { alignItems: "flex-end", gap: 4 },
  invoiceCardAmount: { fontSize: 15, fontWeight: "800", color: theme.colors.primary },
  paidBadge: { backgroundColor: theme.colors.success + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  paidBadgeText: { fontSize: 9, fontWeight: "800", color: theme.colors.success },
  invoiceContent: { width: "100%", maxWidth: 760, alignSelf: "center", paddingBottom: 80 },
  invoiceHeader: { padding: 24, flexDirection: isUrdu ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start" },
  invoiceLogo: {},
  invoiceSubhead: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  invoiceHeaderRight: { alignItems: "flex-end", gap: 4 },
  invoiceNo: { fontSize: 14, fontWeight: "800", color: theme.colors.onBrand },
  invoiceDate: { fontSize: 11, color: "rgba(255,255,255,0.75)" },
  invoicePaidBadge: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 4,
    backgroundColor: theme.colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  invoicePaidText: { fontSize: 10, fontWeight: "800", color: theme.colors.onBrand },
  invoiceBody: { padding: 20, gap: 20 },
  invoiceMetaGrid: { flexDirection: isUrdu ? "row-reverse" : "row", flexWrap: "wrap", gap: 10 },
  invoiceMetaItem: { minWidth: 150, flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
  invoiceParty: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 16 },
  invoicePartyItem: { flex: 1, gap: 4 },
  partyLabel: { fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1 },
  partyName: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  partyDetail: { fontSize: 11, color: theme.colors.textSecondary },
  invoiceTable: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tableHeader: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableHeaderText: { fontSize: 11, fontWeight: "700", color: theme.colors.textSecondary },
  tableRow: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tableRowLabel: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  tableRowSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  tableRowAmount: { fontSize: 14, fontWeight: "700", color: theme.colors.text, textAlign: "right", minWidth: 80 },
  tableDivider: { height: 1, backgroundColor: theme.colors.primary + "30" },
  totalRow: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  totalLabel: { fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.85)" },
  totalAmount: { fontSize: 18, fontWeight: "900", color: theme.colors.onBrand },
  invoiceNote: {
    flexDirection: isUrdu ? "row-reverse" : "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
  },
  invoiceNoteText: { flex: 1, fontSize: 11, color: theme.colors.textSecondary, lineHeight: 17 },
  invoiceFooter: { alignItems: "center", gap: 4 },
  invoiceFooterText: { fontSize: 11, color: theme.colors.textMuted },
  });
}

