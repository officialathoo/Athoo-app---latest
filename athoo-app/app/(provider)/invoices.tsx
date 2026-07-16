import { apiErrorToMessage } from "@/lib/apiError";
import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { api } from "@/services/api";
import { brandConfig } from "@/config/brand";
import { invoiceConfig } from "@/config/invoice";

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

export default function ProviderInvoicesScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const completed = user ? getMyBookings(user.id, "provider").filter((b) => b.status === "completed") : [];

  const invoices = completed.map((b) => {
    const match = apiInvoices.find((i) => i.bookingId === b.id);
    return {
      id: b.id,
      service: b.service,
      customer: b.customerName,
      date: b.scheduledDate
        ? formatLocalizedDate(b.scheduledDate)
        : b.createdAt
          ? formatLocalizedDate(b.createdAt)
          : "—",
      serviceCharge: match ? match.providerAmount : Number(b.providerAmount ?? b.price ?? 0),
      visitCharge: match ? match.visitCharge : Number((b as any).visitCharge ?? 0),
      providerAmount: match ? match.providerAmount : Number(b.providerAmount ?? b.price ?? 0),
      invoiceNo: match ? match.invoiceNumber : `ATH-${b.id.slice(-6).toUpperCase()}`,
    };
  });

  const selected = selectedId ? invoices.find((i) => i.id === selectedId) : null;

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleShareInvoice = async (inv: NonNullable<typeof selected>) => {
    await handleDownloadPdf(inv);
  };

  const handleDownloadPdf = async (inv: NonNullable<typeof selected>) => {
    if (generatingPdf) return;
    const total = inv.serviceCharge + inv.visitCharge;
    const customerName = escapeHtml(inv.customer);
    const serviceName = escapeHtml(inv.service);
    const invoiceDate = escapeHtml(inv.date);
    const direction = isUrdu ? "rtl" : "ltr";

    const printColors = invoiceConfig.colors;
    const invoiceFooter = [invoiceConfig.brandName, invoiceConfig.contactLine].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html><html dir="${direction}"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;color:${printColors.text};background:${printColors.page};direction:${direction}}
  .page{max-width:700px;margin:0 auto;background:${printColors.page};border-radius:12px;overflow:hidden;border:1px solid ${printColors.text};box-shadow:none}
  .header{background:linear-gradient(135deg,${printColors.primary},${printColors.primaryPressed});color:${printColors.page};padding:28px 30px;display:flex;justify-content:space-between;align-items:flex-start}
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
  .total-row{background:linear-gradient(135deg,${printColors.success},${printColors.successPressed});color:${printColors.page}}
  .total-row td{font-weight:700;font-size:15px;padding:14px 12px}
  .note{background:${printColors.successSoft};border:1px solid ${printColors.successBorder};border-radius:8px;padding:12px 14px;font-size:12px;color:${printColors.success};margin-bottom:20px}
  .footer{text-align:center;font-size:11px;color:${printColors.textMuted};padding:0 0 8px}
</style></head><body>
<div class="page">
  <div class="header">
    <div><div class="logo">${escapeHtml(invoiceConfig.brandName)}</div><div class="logo-sub">${escapeHtml(tr("Provider Earnings Statement"))}</div></div>
    <div class="inv-meta"><div class="inv-no">${escapeHtml(inv.invoiceNo)}</div><div class="inv-date">${invoiceDate}</div><div class="paid-badge">✓ ${escapeHtml(tr("EARNED"))}</div></div>
  </div>
  <div class="body">
    <div class="parties">
      <div class="party"><div class="party-label">${escapeHtml(tr("Service Provided To"))}</div><div class="party-name">${customerName}</div></div>
      <div class="party"><div class="party-label">${escapeHtml(tr("Service"))}</div><div class="party-name">${serviceName}</div><div class="party-detail">${invoiceDate}</div></div>
    </div>
    <table>
      <tr><th>${escapeHtml(tr("Description"))}</th><th style="text-align:right">${escapeHtml(tr("Amount"))}</th></tr>
      <tr><td>${serviceName}<br><small style="color:${printColors.textSecondary}">${invoiceDate}</small></td><td class="amount">${escapeHtml(formatCurrency(inv.serviceCharge))}</td></tr>
      ${inv.visitCharge > 0 ? `<tr><td>${escapeHtml(tr("Visit / Call-out Charge"))}</td><td class="amount">${escapeHtml(formatCurrency(inv.visitCharge))}</td></tr>` : ""}
      <tr class="total-row"><td>${escapeHtml(tr("TOTAL EARNED"))}</td><td class="amount">${escapeHtml(formatCurrency(total))}</td></tr>
    </table>
    <div class="note">${escapeHtml(tr("This earnings statement reflects what you received directly from the customer. Keep it for your records."))}</div>
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
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Invoice ${inv.invoiceNo}` });
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
    const total = selected.serviceCharge + selected.visitCharge;
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedId(null)} accessibilityRole="button" accessibilityLabel={tr("Back")}>
            <Icon name={isUrdu ? "arrow-right" : "arrow-left"} size={20} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.title}>{tr("Invoice Details")}</Text>
          <View style={{ flexDirection: isUrdu ? "row-reverse" : "row", gap: 8 }}>
            <Pressable style={styles.shareBtn} onPress={() => handleShareInvoice(selected)} disabled={generatingPdf}>
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
          <View style={styles.invoiceCard}>
            <View style={styles.invoiceTop}>
              <Image source={brandConfig.assets.mark} style={{ width: 72, height: 28 }} resizeMode="contain" />
              <Text style={styles.invoiceNo}>{selected.invoiceNo}</Text>
            </View>
            <Text style={styles.invoiceDate}>{selected.date}</Text>
            <View style={styles.invDivider} />
            <Text style={styles.invSection}>{tr("Provider Earnings")}</Text>
            <View style={styles.invRow}><Text style={styles.invLabel}>{tr("Service")}</Text><Text style={styles.invVal}>{selected.service}</Text></View>
            <View style={styles.invRow}><Text style={styles.invLabel}>{tr("Customer")}</Text><Text style={styles.invVal}>{selected.customer}</Text></View>
            <View style={styles.invDivider} />
            <View style={styles.invRow}><Text style={styles.invLabel}>{tr("Provider Amount")}</Text><Text style={styles.invVal}>{formatCurrency(selected.serviceCharge)}</Text></View>
            {selected.visitCharge > 0 && (
              <View style={styles.invRow}>
                <Text style={styles.invLabel}>{tr("Visit Charge")}</Text>
                <Text style={[styles.invVal, { color: theme.colors.secondary }]}>{formatCurrency(selected.visitCharge)}</Text>
              </View>
            )}
            <View style={styles.invDivider} />
            <View style={styles.invRow}>
              <Text style={styles.invTotalLabel}>{tr("Total Earned")}</Text>
              <Text style={styles.invTotalVal}>{formatCurrency(total)}</Text>
            </View>
          </View>
          {selected.visitCharge > 0 && (
            <View style={styles.noteCard}>
              <Icon name="info" size={13} color={theme.colors.primary} />
              <Text style={styles.noteText}>{tr("A visit/call-out charge of {{amount}} was applied for this job.", { amount: formatCurrency(selected.visitCharge) })}</Text>
            </View>
          )}
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
        <Text style={styles.title}>{tr("My Invoices")}</Text>
      </View>
      {loadingInvoices ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.secondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {invoices.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <Icon name="file-text" size={40} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}>{tr("No Invoices Yet")}</Text>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
                {tr("Invoices will appear here after completing your first job.")}
              </Text>
            </View>
          )}
          {invoices.map((inv) => (
            <Pressable
              key={inv.id}
              style={({ pressed }) => [styles.invItem, pressed && styles.invItemPressed]}
              onPress={() => setSelectedId(inv.id)}
            >
              <View style={styles.invItemIcon}><Icon name="file-text" size={18} color={theme.colors.secondary} /></View>
              <View style={styles.invItemInfo}>
                <Text style={styles.invItemService}>{inv.service}</Text>
                <Text style={styles.invItemCustomer}>{inv.customer} • {inv.date}</Text>
                <Text style={styles.invItemNo}>{inv.invoiceNo}</Text>
              </View>
              <View style={styles.invItemRight}>
                <Text style={styles.invItemAmount}>{formatCurrency(inv.serviceCharge + inv.visitCharge)}</Text>
                <View style={styles.paidBadge}><Text style={styles.paidText}>{tr("PAID")}</Text></View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text, flex: 1 },
  shareBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.primary + "12", alignItems: "center", justifyContent: "center" },
  paidBadge: { backgroundColor: theme.colors.successSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  paidText: { fontSize: 10, fontWeight: "800", color: theme.colors.success },
  listContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, gap: 10, paddingBottom: 40 },
  invItem: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  invItemPressed: { opacity: 0.85 },
  invItemIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  invItemInfo: { flex: 1, gap: 2 },
  invItemService: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  invItemCustomer: { fontSize: 12, color: theme.colors.textSecondary },
  invItemNo: { fontSize: 11, color: theme.colors.textMuted },
  invItemRight: { alignItems: "flex-end", gap: 4 },
  invItemAmount: { fontSize: 14, fontWeight: "800", color: theme.colors.secondary },
  invoiceContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, gap: 12, paddingBottom: 40 },
  invoiceCard: { backgroundColor: theme.colors.surface, borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: theme.colors.border },
  invoiceTop: { flexDirection: isUrdu ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" },
  invoiceNo: { fontSize: 12, fontWeight: "700", color: theme.colors.textSecondary },
  invoiceDate: { fontSize: 12, color: theme.colors.textMuted },
  invDivider: { height: 1, backgroundColor: theme.colors.border },
  invSection: { fontSize: 13, fontWeight: "700", color: theme.colors.textSecondary },
  invRow: { flexDirection: isUrdu ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  invLabel: { fontSize: 13, color: theme.colors.textSecondary },
  invVal: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  invTotalLabel: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  invTotalVal: { fontSize: 18, fontWeight: "900", color: theme.colors.secondary },
  noteCard: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 8,
    backgroundColor: theme.colors.primary + "10", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: theme.colors.primary + "30",
  },
  noteText: { flex: 1, fontSize: 12, color: theme.colors.primary, lineHeight: 17 },
  });
}

