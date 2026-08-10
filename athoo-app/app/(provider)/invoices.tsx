import { apiErrorToMessage } from "@/lib/apiError";
import { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { api } from "@/services/api";
import { brandConfig } from "@/config/brand";
import { downloadBookingInvoice, shareBookingInvoice } from "@/utils/bookingInvoicePdf";

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
  subtotal: number;
  visitCharge: number;
  platformFee: number;
  discountAmount: number;
  totalAmount: number;
  commissionAmount: number;
  providerAmount: number;
  status: string;
  createdAt: string;
  verification: { verificationUrl: string; qrCodeDataUri: string };
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
      serviceAmount: match ? Number(match.subtotal || 0) : Number(b.price ?? 0),
      visitCharge: match ? Number(match.visitCharge || 0) : Number((b as any).visitCharge ?? 0),
      grossTotal: match ? Number(match.totalAmount || 0) : Number((b.price ?? 0) + ((b as any).visitCharge ?? 0)),
      commissionAmount: match ? Number(match.commissionAmount || 0) : Number((b as any).commissionAmount ?? 0),
      providerAmount: match ? Number(match.providerAmount || 0) : Number(b.providerAmount ?? b.price ?? 0),
      ratePerHour: match ? Number(match.ratePerHour || 0) : Number((b as any).ratePerHour ?? 0),
      durationMinutes: match ? Number(match.durationMinutes || 0) : 0,
      jobNumber: match?.bookingPublicId || (b as any).publicId || b.id,
      invoiceNo: match ? match.invoiceNumber : `ATH-${b.id.slice(-6).toUpperCase()}`,
      booking: b,
      apiInvoice: match,
    };
  });

  const selected = selectedId ? invoices.find((i) => i.id === selectedId) : null;

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const invoiceActionInFlightRef = useRef(false);

  const buildInvoicePayload = (
    inv: NonNullable<typeof selected>,
  ) => {
    const match = inv.apiInvoice;

    return {
      ...inv.booking,
      invoiceNumber:
        match?.invoiceNumber ?? inv.invoiceNo,
      subtotal: match?.subtotal,
      totalAmount: match?.totalAmount,
      visitCharge:
        match?.visitCharge ?? inv.visitCharge,
      discountAmount: match?.discountAmount,
      commissionAmount: match?.commissionAmount,
      providerAmount:
        match?.providerAmount ?? inv.providerAmount,
      status:
        match?.status ?? inv.booking.status,
      createdAt:
        match?.createdAt ?? inv.booking.createdAt,
      verification: match?.verification,
    };
  };

  const runInvoiceAction = async (
    action: "share" | "download",
    inv: NonNullable<typeof selected>,
  ) => {
    if (invoiceActionInFlightRef.current) return;

    invoiceActionInFlightRef.current = true;
    setGeneratingPdf(true);

    try {
      const payload = buildInvoicePayload(inv);

      if (action === "share") {
        await shareBookingInvoice(payload, {
          role: "provider",
        });
      } else {
        await downloadBookingInvoice(payload, {
          role: "provider",
        });
      }
    } finally {
      invoiceActionInFlightRef.current = false;
      setGeneratingPdf(false);
    }
  };

  const handleShareInvoice = async (
    inv: NonNullable<typeof selected>,
  ) => {
    await runInvoiceAction("share", inv);
  };

  const handleDownloadPdf = async (
    inv: NonNullable<typeof selected>,
  ) => {
    await runInvoiceAction("download", inv);
  };

  if (selected) {
    const total = selected.providerAmount;
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
            <View style={styles.invRow}><Text style={styles.invLabel}>{tr("Job Number")}</Text><Text style={styles.invVal}>{selected.jobNumber}</Text></View>
            <View style={styles.invRow}><Text style={styles.invLabel}>{tr("Service Amount")}</Text><Text style={styles.invVal}>{formatCurrency(selected.serviceAmount)}</Text></View>
            {selected.visitCharge > 0 && (
              <View style={styles.invRow}>
                <Text style={styles.invLabel}>{tr("Visit Charge")}</Text>
                <Text style={[styles.invVal, { color: theme.colors.secondary }]}>{formatCurrency(selected.visitCharge)}</Text>
              </View>
            )}
            <View style={styles.invRow}><Text style={styles.invLabel}>{tr("Athoo Commission")}</Text><Text style={[styles.invVal, { color: theme.colors.danger }]}>−{formatCurrency(selected.commissionAmount)}</Text></View>
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
                <Text style={styles.invItemAmount}>{formatCurrency(inv.providerAmount)}</Text>
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
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text, flex: 1 },
  shareBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.primary + "12", alignItems: "center", justifyContent: "center" },
  paidBadge: { backgroundColor: theme.colors.successSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  paidText: { fontSize: 10, fontWeight: "800", color: theme.colors.success },
  listContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 14, gap: 8, paddingBottom: 40 },
  invItem: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 10,
    backgroundColor: theme.colors.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  invItemPressed: { opacity: 0.85 },
  invItemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  invItemInfo: { flex: 1, gap: 2 },
  invItemService: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  invItemCustomer: { fontSize: 12, color: theme.colors.textSecondary },
  invItemNo: { fontSize: 11, color: theme.colors.textMuted },
  invItemRight: { alignItems: "flex-end", gap: 4 },
  invItemAmount: { fontSize: 14, fontWeight: "800", color: theme.colors.secondary },
  invoiceContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 14, gap: 10, paddingBottom: 40 },
  invoiceCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: theme.colors.border },
  invoiceTop: { flexDirection: isUrdu ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" },
  invoiceNo: { fontSize: 12, fontWeight: "700", color: theme.colors.textSecondary },
  invoiceDate: { fontSize: 12, color: theme.colors.textMuted },
  invDivider: { height: 1, backgroundColor: theme.colors.border },
  invSection: { fontSize: 13, fontWeight: "700", color: theme.colors.textSecondary },
  invRow: { flexDirection: isUrdu ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  invLabel: { fontSize: 13, color: theme.colors.textSecondary },
  invVal: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  invTotalLabel: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  invTotalVal: { fontSize: 17, fontWeight: "900", color: theme.colors.secondary },
  noteCard: {
    flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 8,
    backgroundColor: theme.colors.primary + "10", borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: theme.colors.primary + "30",
  },
  noteText: { flex: 1, fontSize: 12, color: theme.colors.primary, lineHeight: 17 },
  });
}

