import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { api } from "@/services/api";

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
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [apiInvoices, setApiInvoices] = useState<ApiInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  useEffect(() => {
    api.getInvoices()
      .then((r) => setApiInvoices(r.invoices || []))
      .catch(() => {})
      .finally(() => setLoadingInvoices(false));
  }, []);

  const completed = user ? getMyBookings(user.id, "provider").filter((b) => b.status === "completed") : [];

  const invoices = completed.map((b) => {
    const match = apiInvoices.find((i) => i.bookingId === b.id);
    return {
      id: b.id,
      service: b.service,
      customer: b.customerName,
      date: b.scheduledDate
        ? new Date(b.scheduledDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
        : b.createdAt
          ? new Date(b.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0;color:#0f172a;background:#ffffff}
  .page{max-width:700px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #0f172a;box-shadow:none}
  .header{background:linear-gradient(135deg,#1A6EE0,#0D4BA0);color:#fff;padding:28px 30px;display:flex;justify-content:space-between;align-items:flex-start}
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
  .total-row{background:linear-gradient(135deg,#059669,#047857);color:#fff}
  .total-row td{font-weight:700;font-size:15px;padding:14px 12px}
  .note{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 14px;font-size:12px;color:#15803d;margin-bottom:20px}
  .footer{text-align:center;font-size:11px;color:#94a3b8;padding:0 0 8px}
</style></head><body>
<div class="page">
  <div class="header">
    <div><div class="logo">ATHOO</div><div class="logo-sub">Provider Earnings Statement</div></div>
    <div class="inv-meta"><div class="inv-no">${inv.invoiceNo}</div><div class="inv-date">${inv.date}</div><div class="paid-badge">✓ EARNED</div></div>
  </div>
  <div class="body">
    <div class="parties">
      <div class="party"><div class="party-label">Service Provided To</div><div class="party-name">${inv.customer}</div></div>
      <div class="party"><div class="party-label">Service</div><div class="party-name">${inv.service}</div><div class="party-detail">${inv.date}</div></div>
    </div>
    <table>
      <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
      <tr><td>${inv.service}<br><small style="color:#64748b">${inv.date}</small></td><td class="amount">Rs. ${inv.serviceCharge.toLocaleString()}</td></tr>
      ${inv.visitCharge > 0 ? `<tr><td>Visit / Call-out Charge</td><td class="amount">Rs. ${inv.visitCharge.toLocaleString()}</td></tr>` : ""}
      <tr class="total-row"><td>TOTAL EARNED</td><td class="amount">Rs. ${total.toLocaleString()}</td></tr>
    </table>
    <div class="note">This earnings statement reflects what you received directly from the customer. Keep it for your records.</div>
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
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Invoice ${inv.invoiceNo}` });
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
    const total = selected.serviceCharge + selected.visitCharge;
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedId(null)}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Invoice</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={styles.shareBtn} onPress={() => handleShareInvoice(selected)} disabled={generatingPdf}>
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
          <View style={styles.invoiceCard}>
            <View style={styles.invoiceTop}>
              <Image source={require("../../assets/images/logo.png")} style={{ width: 72, height: 28 }} resizeMode="contain" />
              <Text style={styles.invoiceNo}>{selected.invoiceNo}</Text>
            </View>
            <Text style={styles.invoiceDate}>{selected.date}</Text>
            <View style={styles.invDivider} />
            <Text style={styles.invSection}>Provider Earnings</Text>
            <View style={styles.invRow}><Text style={styles.invLabel}>Service</Text><Text style={styles.invVal}>{selected.service}</Text></View>
            <View style={styles.invRow}><Text style={styles.invLabel}>Customer</Text><Text style={styles.invVal}>{selected.customer}</Text></View>
            <View style={styles.invDivider} />
            <View style={styles.invRow}><Text style={styles.invLabel}>Provider Amount</Text><Text style={styles.invVal}>Rs. {selected.serviceCharge.toLocaleString()}</Text></View>
            {selected.visitCharge > 0 && (
              <View style={styles.invRow}>
                <Text style={styles.invLabel}>Visit Charge</Text>
                <Text style={[styles.invVal, { color: Colors.secondary }]}>Rs. {selected.visitCharge.toLocaleString()}</Text>
              </View>
            )}
            <View style={styles.invDivider} />
            <View style={styles.invRow}>
              <Text style={styles.invTotalLabel}>Total Earned</Text>
              <Text style={styles.invTotalVal}>Rs. {total.toLocaleString()}</Text>
            </View>
          </View>
          {selected.visitCharge > 0 && (
            <View style={styles.noteCard}>
              <Icon name="info" size={13} color={Colors.primary} />
              <Text style={styles.noteText}>A visit/call-out charge of Rs. {selected.visitCharge.toLocaleString()} was applied for this job.</Text>
            </View>
          )}
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
        <Text style={styles.title}>My Invoices</Text>
      </View>
      {loadingInvoices ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Colors.secondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {invoices.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <Icon name="file-text" size={40} color={Colors.textMuted} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text }}>No Invoices Yet</Text>
              <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
                Invoices will appear here after completing your first job.
              </Text>
            </View>
          )}
          {invoices.map((inv) => (
            <Pressable
              key={inv.id}
              style={({ pressed }) => [styles.invItem, pressed && styles.invItemPressed]}
              onPress={() => setSelectedId(inv.id)}
            >
              <View style={styles.invItemIcon}><Icon name="file-text" size={18} color={Colors.secondary} /></View>
              <View style={styles.invItemInfo}>
                <Text style={styles.invItemService}>{inv.service}</Text>
                <Text style={styles.invItemCustomer}>{inv.customer} • {inv.date}</Text>
                <Text style={styles.invItemNo}>{inv.invoiceNo}</Text>
              </View>
              <View style={styles.invItemRight}>
                <Text style={styles.invItemAmount}>Rs. {(inv.serviceCharge + inv.visitCharge).toLocaleString()}</Text>
                <View style={styles.paidBadge}><Text style={styles.paidText}>PAID</Text></View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, flex: 1 },
  shareBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  paidBadge: { backgroundColor: "#22C55E20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  paidText: { fontSize: 10, fontWeight: "800", color: "#22C55E" },
  listContent: { padding: 16, gap: 10, paddingBottom: 40 },
  invItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  invItemPressed: { opacity: 0.85 },
  invItemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  invItemInfo: { flex: 1, gap: 2 },
  invItemService: { fontSize: 14, fontWeight: "700", color: Colors.text },
  invItemCustomer: { fontSize: 12, color: Colors.textSecondary },
  invItemNo: { fontSize: 11, color: Colors.textMuted },
  invItemRight: { alignItems: "flex-end", gap: 4 },
  invItemAmount: { fontSize: 14, fontWeight: "800", color: Colors.secondary },
  invoiceContent: { padding: 16, gap: 12, paddingBottom: 40 },
  invoiceCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: Colors.border },
  invoiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  invoiceNo: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  invoiceDate: { fontSize: 12, color: Colors.textMuted },
  invDivider: { height: 1, backgroundColor: Colors.border },
  invSection: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  invRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  invLabel: { fontSize: 13, color: Colors.textSecondary },
  invVal: { fontSize: 13, fontWeight: "600", color: Colors.text },
  invTotalLabel: { fontSize: 15, fontWeight: "800", color: Colors.text },
  invTotalVal: { fontSize: 18, fontWeight: "900", color: Colors.secondary },
  noteCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 17 },
});
