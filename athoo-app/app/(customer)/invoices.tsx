import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { api } from "@/services/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
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
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [apiInvoices, setApiInvoices] = useState<ApiInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  useEffect(() => {
    api.getInvoices()
      .then((r) => setApiInvoices(r.invoices || []))
      .catch(() => {})
      .finally(() => setLoadingInvoices(false));
  }, []);

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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;color:#0f172a;background:#ffffff}
  .page{max-width:700px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #0f172a;box-shadow:none}
  .header{background:#0D4BA0;color:#fff;padding:28px 30px;display:flex;justify-content:space-between;align-items:flex-start;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .logo{font-size:24px;font-weight:900;letter-spacing:-1px}
  .logo-sub{font-size:11px;opacity:.75;margin-top:2px}
  .inv-meta{text-align:right}
  .inv-no{font-size:18px;font-weight:700}
  .inv-date{font-size:12px;opacity:.8;margin-top:4px}
  .paid-badge{background:rgba(255,255,255,0.25);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;margin-top:8px;display:inline-block}
  .body{padding:28px 30px}
  .parties{display:flex;gap:30px;margin-bottom:24px}
  .party{flex:1;background:#ffffff;border:1px solid #0f172a;border-radius:10px;padding:14px 16px}
  .party-label{font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .party-name{font-size:15px;font-weight:700;color:#1e293b;margin-bottom:3px}
  .party-detail{font-size:12px;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#e2e8f0;font-size:11px;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;text-align:left;font-weight:700}
  td{padding:11px 12px;font-size:13px;border-bottom:1px solid #cbd5e1}
  .amount{text-align:right}
  .total-row{background:linear-gradient(135deg,#1A6EE0,#0D4BA0);color:#fff}
  .total-row td{font-weight:700;font-size:15px;padding:14px 12px}
  .formula{background:#eff6ff;border:1px solid #1A6EE0;border-radius:8px;padding:12px 14px;font-size:12px;color:#0f172a;font-weight:700;margin-bottom:16px}
  .note{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 14px;font-size:12px;color:#0369a1;margin-bottom:20px}
  .footer{text-align:center;font-size:11px;color:#94a3b8;padding:0 0 8px}
</style></head><body>
<div class="page">
  <div class="header">
    <div><div class="logo">ATHOO</div><div class="logo-sub">Home Services · Rawalpindi &amp; Islamabad</div></div>
    <div class="inv-meta"><div class="inv-no">${invoiceNo}</div><div class="inv-date">${formatDate(b.createdAt)}</div><div class="paid-badge">✓ PAID</div></div>
  </div>
  <div class="body">
    <div class="parties">
      <div class="party"><div class="party-label">Billed To</div><div class="party-name">${b.customerName ?? ""}</div><div class="party-detail">${b.address ?? ""}</div></div>
      <div class="party"><div class="party-label">Service By</div><div class="party-name">${b.providerName ?? ""}</div><div class="party-detail">${b.service ?? ""}</div></div>
    </div>
    <div class="formula">Final Invoice = Hourly Rate × Actual Job Time + Travel Charges</div>
    <table>
      <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
      <tr><td>Hourly Rate<br><small style="color:#64748b">Rs. ${hourlyRate.toLocaleString()} / hour × ${durationHours} hour(s)</small></td><td class="amount">Rs. ${serviceAmount.toLocaleString()}</td></tr>
      ${visitCharge > 0 ? `<tr><td>Travel Charges<br><small style="color:#64748b">Separate from hourly rate</small></td><td class="amount">Rs. ${visitCharge.toLocaleString()}</td></tr>` : ""}
      <tr><td style="color:#64748b">Subtotal</td><td class="amount" style="color:#64748b">Rs. ${subtotal.toLocaleString()}</td></tr>
      ${discount > 0 ? `<tr><td style="color:#059669">Discount Applied</td><td class="amount" style="color:#059669">−Rs. ${discount.toLocaleString()}</td></tr>` : ""}
      <tr><td style="color:#94a3b8">Tax (0%)</td><td class="amount" style="color:#94a3b8">Rs. 0</td></tr>
      <tr class="total-row"><td>TOTAL PAID</td><td class="amount">Rs. ${total.toLocaleString()}</td></tr>
    </table>
    <div class="note">Payment was made directly in cash to the service provider. Athoo does not handle funds. This is an electronic receipt only.</div>
    <div class="footer">Athoo · +92 339 0051068 · @athoo_services · Thank you for using Athoo!</div>
  </div>
</div>
</body></html>`;

    try {
      setGeneratingPdf(true);
      if (Platform.OS === "web") {
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); w.print(); }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Invoice ${invoiceNo}` });
      } else {
        Alert.alert("Saved", `Invoice saved to: ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not generate PDF. Please try again.");
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
          <Pressable style={styles.backBtn} onPress={() => setSelectedInvoice(null)}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Invoice Detail</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={styles.shareBtn} onPress={() => handleShare(selected)} disabled={generatingPdf}>
              <Icon name="share-2" size={18} color={Colors.primary} />
            </Pressable>
            <Pressable style={[styles.shareBtn, { backgroundColor: Colors.primary + "15" }]} onPress={() => handleDownloadPdf(selected)} disabled={generatingPdf}>
              {generatingPdf
                ? <Icon name="loader" size={18} color={Colors.primary} />
                : <Icon name="download" size={18} color={Colors.primary} />}
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.invoiceContent}>
          <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.invoiceHeader}>
            <View style={styles.invoiceLogo}>
              <Image source={require("../../assets/images/logo.png")} style={{ width: 80, height: 32 }} resizeMode="contain" />
              <Text style={styles.invoiceSubhead}>Home Services · Pakistan</Text>
            </View>
            <View style={styles.invoiceHeaderRight}>
              <Text style={styles.invoiceNo}>{getInvoiceNo(selected.id)}</Text>
              <Text style={styles.invoiceDate}>{formatDate(selected.createdAt)}</Text>
              <View style={styles.invoicePaidBadge}>
                <Icon name="check-circle" size={11} color="#fff" />
                <Text style={styles.invoicePaidText}>PAID</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.invoiceBody}>
            <View style={styles.invoiceParty}>
              <View style={styles.invoicePartyItem}>
                <Text style={styles.partyLabel}>BILLED TO</Text>
                <Text style={styles.partyName}>{selected.customerName}</Text>
                <Text style={styles.partyDetail}>{selected.address}</Text>
              </View>
              <View style={styles.invoicePartyItem}>
                <Text style={styles.partyLabel}>SERVICE BY</Text>
                <Text style={styles.partyName}>{selected.providerName}</Text>
                <Text style={styles.partyDetail}>{selected.service}</Text>
              </View>
            </View>

            <View style={styles.invoiceTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Description</Text>
                <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>Amount</Text>
              </View>

              <View style={styles.tableRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tableRowLabel}>{selected.service}</Text>
                  <Text style={styles.tableRowSub}>{selected.scheduledDate} · {selected.scheduledTime}</Text>
                </View>
                <Text style={styles.tableRowAmount}>Rs. {serviceAmount.toLocaleString()}</Text>
              </View>

              {visitCharge > 0 && (
                <View style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableRowLabel}>Visit / Call-out Charge</Text>
                    <Text style={styles.tableRowSub}>Fixed visit fee</Text>
                  </View>
                  <Text style={styles.tableRowAmount}>Rs. {visitCharge.toLocaleString()}</Text>
                </View>
              )}

              <View style={styles.tableDivider} />

              <View style={styles.tableRow}>
                <Text style={[styles.tableRowLabel, { flex: 2 }]}>Subtotal</Text>
                <Text style={styles.tableRowAmount}>Rs. {subtotal.toLocaleString()}</Text>
              </View>

              {match && match.discountAmount > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableRowLabel, { flex: 2, color: Colors.success }]}>Discount</Text>
                  <Text style={[styles.tableRowAmount, { color: Colors.success }]}>−Rs. {match.discountAmount.toLocaleString()}</Text>
                </View>
              )}

              <View style={styles.tableRow}>
                <Text style={[styles.tableRowLabel, { flex: 2, color: Colors.textSecondary }]}>Tax (0%)</Text>
                <Text style={[styles.tableRowAmount, { color: Colors.textSecondary }]}>Rs. 0</Text>
              </View>

              <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL PAID</Text>
                <Text style={styles.totalAmount}>Rs. {(match ? match.totalAmount : subtotal).toLocaleString()}</Text>
              </LinearGradient>
            </View>

            <View style={styles.invoiceNote}>
              <Icon name="info" size={13} color={Colors.textSecondary} />
              <Text style={styles.invoiceNoteText}>
                Payment was made directly in cash to the service provider. Athoo does not handle funds. This is an electronic receipt only.
              </Text>
            </View>

            <View style={styles.invoiceFooter}>
              <Text style={styles.invoiceFooterText}>Athoo · +92 339 0051068 · @athoo_services</Text>
              <Text style={styles.invoiceFooterText}>Thank you for using Athoo!</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Invoices</Text>
      </View>

      {loadingInvoices ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {completed.length === 0 ? (
            <AnimatedCard>
              <View style={styles.empty}>
                <Icon name="file-text" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No invoices yet</Text>
                <Text style={styles.emptySubtitle}>Invoices appear after service completion</Text>
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
                        <Icon name="file-text" size={20} color={Colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.invoiceCardNo}>{getInvoiceNo(b.id)}</Text>
                        <Text style={styles.invoiceCardService}>{b.service}</Text>
                        <Text style={styles.invoiceCardDate}>{formatDate(b.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={styles.invoiceCardRight}>
                      <Text style={styles.invoiceCardAmount}>Rs. {subtotal.toLocaleString()}</Text>
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>PAID</Text>
                      </View>
                      <Icon name="chevron-right" size={14} color={Colors.textMuted} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.background, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.text },
  shareBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  listContent: { padding: 20, gap: 12, paddingBottom: 80 },
  empty: { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary },
  invoiceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  invoiceCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  invoiceIconBox: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  invoiceCardNo: { fontSize: 13, fontWeight: "800", color: Colors.text },
  invoiceCardService: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  invoiceCardDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  invoiceCardRight: { alignItems: "flex-end", gap: 4 },
  invoiceCardAmount: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  paidBadge: { backgroundColor: Colors.success + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  paidBadgeText: { fontSize: 9, fontWeight: "800", color: Colors.success },
  invoiceContent: { paddingBottom: 80 },
  invoiceHeader: { padding: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  invoiceLogo: {},
  invoiceSubhead: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  invoiceHeaderRight: { alignItems: "flex-end", gap: 4 },
  invoiceNo: { fontSize: 14, fontWeight: "800", color: "#fff" },
  invoiceDate: { fontSize: 11, color: "rgba(255,255,255,0.75)" },
  invoicePaidBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  invoicePaidText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  invoiceBody: { padding: 20, gap: 20 },
  invoiceParty: { flexDirection: "row", gap: 16 },
  invoicePartyItem: { flex: 1, gap: 4 },
  partyLabel: { fontSize: 9, fontWeight: "800", color: Colors.textMuted, letterSpacing: 1 },
  partyName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  partyDetail: { fontSize: 11, color: Colors.textSecondary },
  invoiceTable: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableHeaderText: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableRowLabel: { fontSize: 13, fontWeight: "700", color: Colors.text },
  tableRowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  tableRowAmount: { fontSize: 14, fontWeight: "700", color: Colors.text, textAlign: "right", minWidth: 80 },
  tableDivider: { height: 1, backgroundColor: Colors.primary + "30" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  totalLabel: { fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.85)" },
  totalAmount: { fontSize: 18, fontWeight: "900", color: "#fff" },
  invoiceNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  invoiceNoteText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 17 },
  invoiceFooter: { alignItems: "center", gap: 4 },
  invoiceFooterText: { fontSize: 11, color: Colors.textMuted },
});
