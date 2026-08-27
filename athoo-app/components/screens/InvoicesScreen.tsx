import { apiErrorToMessage } from "@/lib/apiError";
import { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { api } from "@/services/api";
import { downloadBookingInvoice, shareBookingInvoice } from "@/utils/bookingInvoicePdf";
import { AnimatedCard } from "@/components/ui/AnimatedCard";

export type InvoiceRole = "customer" | "provider";

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
  verification: { verificationUrl: string; qrCodeDataUri: string };
};

function useInvoiceData(tr: (message: string, params?: Record<string, string | number>) => string) {
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
  return { apiInvoices, loadingInvoices, loadError, loadInvoices };
}

async function runInvoiceAction(
  action: "share" | "download",
  payload: any,
  role: InvoiceRole,
  inFlightRef: React.MutableRefObject<boolean>,
  setGenerating: (value: boolean) => void,
) {
  if (inFlightRef.current) return;
  inFlightRef.current = true;
  setGenerating(true);
  try {
    if (action === "share") {
      await shareBookingInvoice(payload, { role });
    } else {
      await downloadBookingInvoice(payload, { role });
    }
  } finally {
    inFlightRef.current = false;
    setGenerating(false);
  }
}

export function CustomerInvoicesScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createCustomerStyles(theme, isUrdu), [theme, isUrdu]);
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const { apiInvoices, loadingInvoices, loadError, loadInvoices } = useInvoiceData(tr);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const invoiceActionInFlightRef = useRef(false);

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

  const buildInvoicePayload = (b: any) => {
    const match = apiInvoices.find((invoice) => invoice.bookingId === b.id);
    return {
      ...b,
      invoiceNumber: match?.invoiceNumber,
      subtotal: match?.subtotal,
      totalAmount: match?.totalAmount,
      visitCharge: match?.visitCharge ?? b.visitCharge,
      discountAmount: match?.discountAmount,
      commissionAmount: match?.commissionAmount,
      providerAmount: match?.providerAmount,
      status: match?.status ?? b.status,
      createdAt: match?.createdAt ?? b.createdAt,
      verification: match?.verification,
    };
  };

  const handleShare = async (b: any) => {
    await runInvoiceAction("share", buildInvoicePayload(b), "customer", invoiceActionInFlightRef, setGeneratingPdf);
  };

  const handleDownloadPdf = async (b: any) => {
    await runInvoiceAction("download", buildInvoicePayload(b), "customer", invoiceActionInFlightRef, setGeneratingPdf);
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

export function ProviderInvoicesScreen() {
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate: formatLocalizedDate, translate: tr } = useLang();
  const styles = useMemo(() => createProviderStyles(theme, isUrdu), [theme, isUrdu]);
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { apiInvoices, loadingInvoices, loadError, loadInvoices } = useInvoiceData(tr);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const invoiceActionInFlightRef = useRef(false);

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

  const handleShareInvoice = async (
    inv: NonNullable<typeof selected>,
  ) => {
    await runInvoiceAction("share", buildInvoicePayload(inv), "provider", invoiceActionInFlightRef, setGeneratingPdf);
  };

  const handleDownloadPdf = async (
    inv: NonNullable<typeof selected>,
  ) => {
    await runInvoiceAction("download", buildInvoicePayload(inv), "provider", invoiceActionInFlightRef, setGeneratingPdf);
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

export default function InvoicesScreen({ role = "customer" }: { role?: InvoiceRole }) {
  return role === "provider" ? <ProviderInvoicesScreen /> : <CustomerInvoicesScreen />;
}

function createCustomerStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: redesign.layout.horizontalPadding,
      paddingTop: 14,
      paddingBottom: 14,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: redesign.visual.cardBorderWidth,
      borderBottomColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    backBtn: {
      width: redesign.control.iconButtonSize, height: redesign.control.iconButtonSize, borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center",
      borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border,
    },
    headerTitle: { flex: 1, ...theme.typography.h2, color: theme.colors.text, letterSpacing: -0.25 },
    shareBtn: {
      width: redesign.control.iconButtonSize, height: redesign.control.iconButtonSize, borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center",
      borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border,
    },
    listContent: { width: "100%", maxWidth: 760, alignSelf: "center", padding: redesign.layout.horizontalPadding, gap: 12, paddingBottom: 80 },
    empty: { alignItems: "center", paddingVertical: 80, gap: 10, backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border, ...theme.shadows.sm },
    emptyTitle: { ...theme.typography.h3, color: theme.colors.text },
    emptySubtitle: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },
    errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
    errorTitle: { ...theme.typography.h3, color: theme.colors.text },
    errorText: { maxWidth: 420, ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },
    retryBtn: { minHeight: redesign.control.standardHeight, minWidth: 120, marginTop: 6, borderRadius: theme.radius.md, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary, ...theme.shadows.sm },
    retryText: { color: theme.colors.white, ...theme.typography.label },
    invoiceCard: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      padding: 16,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    pressed: { opacity: 0.88, transform: [{ scale: redesign.visual.pressedScale }] },
    invoiceCardLeft: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, flex: 1 },
    invoiceIconBox: {
      width: 44, height: 44, borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center",
    },
    invoiceCardNo: { ...theme.typography.label, color: theme.colors.text },
    invoiceCardService: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 1 },
    invoiceCardDate: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 1 },
    invoiceCardRight: { alignItems: "flex-end", gap: 4 },
    invoiceCardAmount: { ...theme.typography.h3, color: theme.colors.primary },
    paidBadge: { backgroundColor: theme.colors.successSoft, paddingHorizontal: 8, minHeight: 24, justifyContent: "center", borderRadius: theme.radius.pill },
    paidBadgeText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.success },
    invoiceContent: { width: "100%", maxWidth: 760, alignSelf: "center", paddingBottom: 80 },
    invoiceHeader: { padding: 24, flexDirection: isUrdu ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomLeftRadius: theme.radius.xl, borderBottomRightRadius: theme.radius.xl },
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
    invoiceMetaItem: { minWidth: 150, flex: 1, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 12, borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border },
    invoiceParty: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 16 },
    invoicePartyItem: { flex: 1, gap: 4 },
    partyLabel: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textMuted, letterSpacing: 1 },
    partyName: { ...theme.typography.label, color: theme.colors.text },
    partyDetail: { ...theme.typography.caption, color: theme.colors.textSecondary },
    invoiceTable: {
      borderRadius: theme.radius.lg,
      overflow: "hidden",
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    tableHeader: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    tableHeaderText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary },
    tableRow: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tableRowLabel: { ...theme.typography.label, color: theme.colors.text },
    tableRowSub: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 1 },
    tableRowAmount: { ...theme.typography.label, color: theme.colors.text, textAlign: "right", flexShrink: 1, minWidth: 0 },
    tableDivider: { height: 1, backgroundColor: theme.colors.primary + "30" },
    totalRow: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    totalLabel: { fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.85)", flexShrink: 1, minWidth: 0 },
    totalAmount: { fontSize: 18, fontWeight: "900", color: theme.colors.onBrand, flexShrink: 1, minWidth: 0 },
    invoiceNote: {
      flexDirection: isUrdu ? "row-reverse" : "row",
      gap: 8,
      alignItems: "flex-start",
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radius.md,
      padding: 12,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    invoiceNoteText: { flex: 1, ...theme.typography.caption, color: theme.colors.textSecondary },
    invoiceFooter: { alignItems: "center", gap: 4 },
    invoiceFooterText: { ...theme.typography.caption, color: theme.colors.textMuted },
  });
}

function createProviderStyles(theme: AthooTheme, isUrdu: boolean) {
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
