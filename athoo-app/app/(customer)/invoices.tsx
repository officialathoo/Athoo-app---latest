import { apiErrorToMessage } from "@/lib/apiError";
import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
  customerId: string;
  providerId: string;
  customerName: string;
  providerName: string;
  service: string;
  address: string;
  scheduledDate: string;
  scheduledTime: string;
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

  const completed = user
    ? getMyBookings(user.id, "customer").filter((b) => b.status === "completed")
    : [];

  const selected = completed.find((b) => b.id === selectedInvoice);

  function getInvoiceNo(bookingId: string): string {
    const match = apiInvoices.find((i) => i.bookingId === bookingId);
    if (match) return match.invoiceNumber;
    const b = completed.find((x) => x.id === bookingId);
    return b ? `ATH-${b.id.slice(-6).toUpperCase()}` : "ATH-??????";
  }

  function getInvoiceTotal(b: any): { subtotal: number; visitCharge: number } {
    const match = apiInvoices.find((i) => i.bookingId === b.id);
    if (match) return { subtotal: match.subtotal, visitCharge: match.visitCharge };
    const serviceAmount = b.price || 0;
    const visitCharge = (b as any).visitCharge ?? 0;
    return { subtotal: serviceAmount + visitCharge, visitCharge };
  }

  const handleShare = async (b: any) => {
    await handleDownloadPdf(b);
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPdf = async (b: any) => {
    if (generatingPdf) return;
    const invoiceNo = getInvoiceNo(b.id);
    const { subtotal, visitCharge } = getInvoiceTotal(b);
    const serviceAmount = subtotal - visitCharge;
    const hourlyRate = Number((b as any).ratePerHour ?? (b as any).price ?? serviceAmount ?? 0);
    const durationHours = hourlyRate > 0 ? Math.max(1, Math.round((serviceAmount / hourlyRate) * 100) / 100) : 1;
    const match = apiInvoices.find((i) => i.bookingId === b.id);
    const discount = match?.discountAmount ?? 0;
    const total = match?.totalAmount ?? subtotal;
    const customerName = escapeHtml(b.customerName);
    const providerName = escapeHtml(b.providerName);
    const address = escapeHtml(b.address);
    const serviceName = escapeHtml(b.service);
    const direction = isUrdu ? "rtl" : "ltr";

    const printColors = invoiceConfig.colors;
    const invoiceFooter = [invoiceConfig.brandName, invoiceConfig.contactLine].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html><html dir="${direction}"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;color:${printColors.text};background:${printColors.page};direction:${direction}}
  .page{max-width:700px;margin:0 auto;background:${printColors.page};border-radius:12px;overflow:hidden;border:1px solid ${printColors.text};box-shadow:none}
  .header{background:${printColors.primaryPressed};color:${printColors.page};padding:28px 30px;display:flex;justify-content:space-between;align-items:flex-start;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .logo{font-size:24px;font-weight:900;letter-spacing:-1px}
  .logo-sub{font-size:11px;opacity:.75;margin-top:2px}
  .inv-meta{text-align:right}
  .inv-no{font-size:18px;font-weight:700}
  .inv-date{font-size:12px;opacity:.8;margin-top:4px}
  .paid-badge{background:rgba(255,255,255,0.25);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;margin-top:8px;display:inline-block}
  .body{padding:28px 30px}
  .parties{display:flex;gap:30px;margin-bottom:24px}
  .party{flex:1;background:${printColors.page};border:1px solid ${printColors.text};border-radius:10px;padding:14px 16px}
  .party-label{font-size:10px;color:${printColors.textMuted};font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .party-name{font-size:15px;font-weight:700;color:${printColors.text};margin-bottom:3px}
  .party-detail{font-size:12px;color:${printColors.textSecondary}}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:${printColors.surface};font-size:11px;color:${printColors.text};text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;text-align:left;font-weight:700}
  td{padding:11px 12px;font-size:13px;border-bottom:1px solid ${printColors.border}}
  .amount{text-align:right}
  .total-row{background:linear-gradient(135deg,${printColors.primary},${printColors.primaryPressed});color:${printColors.page}}
  .total-row td{font-weight:700;font-size:15px;padding:14px 12px}
  .formula{background:${printColors.infoSoft};border:1px solid ${printColors.primary};border-radius:8px;padding:12px 14px;font-size:12px;color:${printColors.text};font-weight:700;margin-bottom:16px}
  .note{background:${printColors.infoSoft};border:1px solid ${printColors.infoBorder};border-radius:8px;padding:12px 14px;font-size:12px;color:${printColors.info};margin-bottom:20px}
  .footer{text-align:center;font-size:11px;color:${printColors.textMuted};padding:0 0 8px}
</style></head><body>
<div class="page">
  <div class="header">
    <div><div class="logo">${escapeHtml(invoiceConfig.brandName)}</div><div class="logo-sub">${escapeHtml(tr("Home Services · Across Pakistan"))}</div></div>
    <div class="inv-meta"><div class="inv-no">${escapeHtml(invoiceNo)}</div><div class="inv-date">${escapeHtml(formatLocalizedDate(b.createdAt))}</div><div class="paid-badge">✓ ${escapeHtml(tr("PAID"))}</div></div>
  </div>
  <div class="body">
    <div class="parties">
      <div class="party"><div class="party-label">${escapeHtml(tr("Billed To"))}</div><div class="party-name">${customerName}</div><div class="party-detail">${address}</div></div>
      <div class="party"><div class="party-label">${escapeHtml(tr("Service By"))}</div><div class="party-name">${providerName}</div><div class="party-detail">${serviceName}</div></div>
    </div>
    <div class="formula">${escapeHtml(tr("Final Invoice = Hourly Rate × Actual Job Time + Travel Charges"))}</div>
    <table>
      <tr><th>${escapeHtml(tr("Description"))}</th><th style="text-align:right">${escapeHtml(tr("Amount"))}</th></tr>
      <tr><td>${escapeHtml(tr("Hourly Rate"))}<br><small style="color:${printColors.textSecondary}">${escapeHtml(formatCurrency(hourlyRate))} / ${escapeHtml(tr("hour"))} × ${durationHours} ${escapeHtml(tr("hour(s)"))}</small></td><td class="amount">${escapeHtml(formatCurrency(serviceAmount))}</td></tr>
      ${visitCharge > 0 ? `<tr><td>${escapeHtml(tr("Travel Charges"))}<br><small style="color:${printColors.textSecondary}">${escapeHtml(tr("Separate from hourly rate"))}</small></td><td class="amount">${escapeHtml(formatCurrency(visitCharge))}</td></tr>` : ""}
      <tr><td style="color:${printColors.textSecondary}">${escapeHtml(tr("Subtotal"))}</td><td class="amount" style="color:${printColors.textSecondary}">${escapeHtml(formatCurrency(subtotal))}</td></tr>
      ${discount > 0 ? `<tr><td style="color:${printColors.success}">${escapeHtml(tr("Discount Applied"))}</td><td class="amount" style="color:${printColors.success}">−${escapeHtml(formatCurrency(discount))}</td></tr>` : ""}
      <tr class="total-row"><td>${escapeHtml(tr("TOTAL PAID"))}</td><td class="amount">${escapeHtml(formatCurrency(total))}</td></tr>
    </table>
    <div class="note">${escapeHtml(tr("Payment was made directly to the service provider. Athoo does not handle funds. This is an electronic receipt only."))}</div>
    <div class="footer">${escapeHtml(invoiceFooter)}${invoiceFooter ? " · " : ""}${escapeHtml(tr("Thank you for using {{name}}!", { name: invoiceConfig.brandName }))}</div>
  </div>
</div>
</body></html>`;

    try {
      setGeneratingPdf(true);
      if (Platform.OS === "web") {
        const w = window.open("", "_blank", "noopener,noreferrer");
        if (w) { w.opener = null; w.document.write(html); w.document.close(); w.print(); }
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
    const { subtotal, visitCharge } = getInvoiceTotal(selected);
    const serviceAmount = subtotal - visitCharge;
    const hourlyRate = Number((selected as any).ratePerHour ?? (selected as any).price ?? serviceAmount ?? 0);
    const durationHours = hourlyRate > 0 ? Math.max(1, Math.round((serviceAmount / hourlyRate) * 100) / 100) : 1;
    const match = apiInvoices.find((i) => i.bookingId === selected.id);

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
                <Text style={styles.invoicePaidText}>{tr("PAID")}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.invoiceBody}>
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
                  <Text style={styles.tableRowSub}>{selected.scheduledDate} · {selected.scheduledTime}</Text>
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
                <Text style={styles.tableRowAmount}>{formatCurrency(subtotal)}</Text>
              </View>

              {match && match.discountAmount > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableRowLabel, { flex: 2, color: theme.colors.success }]}>{tr("Discount")}</Text>
                  <Text style={[styles.tableRowAmount, { color: theme.colors.success }]}>−{formatCurrency(match.discountAmount)}</Text>
                </View>
              )}

              <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.totalRow}>
                <Text style={styles.totalLabel}>{tr("TOTAL PAID")}</Text>
                <Text style={styles.totalAmount}>{formatCurrency(match ? match.totalAmount : subtotal)}</Text>
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
              const { subtotal } = getInvoiceTotal(b);
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
                      <Text style={styles.invoiceCardAmount}>{formatCurrency(subtotal)}</Text>
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>{tr("PAID")}</Text>
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

