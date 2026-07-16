import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Period = "week" | "month" | "all";
type ChartBar = { label: string; amount: number };

type Translate = (message: string, params?: Record<string, string | number>) => string;

function buildChartData(bookings: any[], period: Period, tr: Translate): ChartBar[] {
  const now = new Date();
  if (period === "week") {
    const days = [tr("Mon"), tr("Tue"), tr("Wed"), tr("Thu"), tr("Fri"), tr("Sat"), tr("Sun")];
    const buckets: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    bookings.forEach((booking) => {
      const date = new Date(booking.scheduledDate || booking.createdAt || now);
      const difference = Math.floor((date.getTime() - startOfWeek.getTime()) / 86400000);
      if (difference >= 0 && difference < 7) {
        buckets[difference] = (buckets[difference] || 0) + Number(booking.providerAmount ?? booking.price ?? 0);
      }
    });
    return days.map((label, index) => ({ label, amount: buckets[index] || 0 }));
  }

  if (period === "month") {
    const weeks: ChartBar[] = [1, 2, 3, 4].map((week) => ({ label: tr("Wk {{week}}", { week }), amount: 0 }));
    bookings.forEach((booking) => {
      const date = new Date(booking.scheduledDate || booking.createdAt || now);
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
        const week = Math.min(3, Math.floor((date.getDate() - 1) / 7));
        weeks[week].amount += Number(booking.providerAmount ?? booking.price ?? 0);
      }
    });
    return weeks;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month) => tr(month));
  const buckets: number[] = new Array(12).fill(0);
  bookings.forEach((booking) => {
    const date = new Date(booking.scheduledDate || booking.createdAt || now);
    if (date.getFullYear() === now.getFullYear()) {
      buckets[date.getMonth()] += Number(booking.providerAmount ?? booking.price ?? 0);
    }
  });
  return months.map((label, index) => ({ label, amount: buckets[index] }));
}

interface EarningsBarChartProps {
  bars: ChartBar[];
  theme: AthooTheme;
  isUrdu: boolean;
  formatNumber: (value: number) => string;
  label: string;
}

function EarningsBarChart({ bars, theme, isUrdu, formatNumber, label }: EarningsBarChartProps) {
  const maxAmount = Math.max(...bars.map((bar) => bar.amount), 1);
  const styles = useMemo(() => createChartStyles(theme, isUrdu), [theme, isUrdu]);
  return (
    <View style={styles.container} accessible accessibilityRole="image" accessibilityLabel={label}>
      <View style={styles.bars}>
        {bars.map((bar, index) => {
          const heightPercent = bar.amount / maxAmount;
          return (
            <View key={`${bar.label}-${index}`} style={styles.barCol} accessible accessibilityLabel={`${bar.label}: ${formatNumber(bar.amount)}`}>
              <Text style={styles.barAmt} numberOfLines={1}>
                {bar.amount > 0 ? (bar.amount >= 1000 ? `${(bar.amount / 1000).toFixed(1)}k` : formatNumber(bar.amount)) : ""}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(heightPercent * 100, bar.amount > 0 ? 4 : 0)}%`,
                      backgroundColor: bar.amount > 0 ? theme.colors.secondary : theme.colors.border,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{bar.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ProviderEarningsScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate, formatNumber, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [period, setPeriod] = useState<Period>("month");

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const completedBookings = allBookings.filter((booking) => booking.status === "completed");
  const pendingPayout = allBookings.filter((booking) => booking.status === "accepted" || booking.status === "in_progress");

  const summary = useMemo(() => {
    const providerNet = completedBookings.reduce(
      (sum, booking: any) => sum + Number(booking.providerAmount ?? booking.price ?? 0),
      0,
    );
    const commission = completedBookings.reduce(
      (sum, booking: any) => sum + Number(booking.commissionAmount || 0),
      0,
    );
    const pendingGross = pendingPayout.reduce((sum, booking) => sum + Number(booking.price || 0), 0);
    return { providerNet, commission, pendingGross };
  }, [completedBookings, pendingPayout]);

  const chartBars = useMemo(
    () => buildChartData(completedBookings, period, tr),
    [completedBookings, period, tr],
  );

  const periods: Array<{ value: Period; label: string }> = [
    { value: "week", label: tr("This Week") },
    { value: "month", label: tr("This Month") },
    { value: "all", label: tr("All Time") },
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tr("Back")}
          hitSlop={8}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr("Earnings")}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
        <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>{tr("Net Earnings")}</Text>
          <Text style={styles.earningsAmount}>{formatCurrency(summary.providerNet)}</Text>
          <View style={styles.earningsRow} accessibilityRole="summary">
            <View style={styles.earningsStat}>
              <Text style={styles.earningsStatVal}>{formatNumber(completedBookings.length)}</Text>
              <Text style={styles.earningsStatLbl}>{tr("Completed Jobs")}</Text>
            </View>
            <View style={styles.earningsDivider} />
            <View style={styles.earningsStat}>
              <Text style={[styles.earningsStatVal, styles.pendingValue]}>{formatCurrency(summary.pendingGross)}</Text>
              <Text style={styles.earningsStatLbl}>{tr("Active Jobs")}</Text>
            </View>
            <View style={styles.earningsDivider} />
            <View style={styles.earningsStat}>
              <Text style={[styles.earningsStatVal, styles.commissionValue]}>{formatCurrency(summary.commission)}</Text>
              <Text style={styles.earningsStatLbl}>{tr("Athoo Commission")}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.infoCard, user?.isBlocked && styles.warningCard]} accessibilityRole={user?.isBlocked ? "alert" : "text"}>
          <View style={styles.infoRow}>
            <Icon
              name={user?.isBlocked ? "alert-triangle" : "info"}
              size={16}
              color={user?.isBlocked ? theme.colors.warning : theme.colors.primary}
            />
            <Text style={[styles.infoText, user?.isBlocked && styles.warningText]}>
              {tr("Pending Athoo commission:")} <Text style={styles.bold}>{formatCurrency(Number(user?.pendingCommission || 0))}</Text>
            </Text>
          </View>
          <Text style={[styles.subInfoText, user?.isBlocked && styles.warningText]}>
            {tr("Limit: {{amount}}", { amount: formatCurrency(Number(user?.commissionLimit || 0)) })}{" "}
            {user?.isBlocked
              ? tr("New jobs are blocked until payment is cleared.")
              : tr("Keep your dues below the limit to continue receiving orders.")}
          </Text>
          {user?.blockedReason ? <Text style={[styles.subInfoText, styles.warningText]}>{user.blockedReason}</Text> : null}
        </View>

        <View style={styles.periodRow} accessibilityRole="tablist">
          {periods.map((option) => {
            const selected = period === option.value;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [styles.periodBtn, selected && styles.periodBtnActive, pressed && styles.pressed]}
                onPress={() => setPeriod(option.value)}
                accessibilityRole="tab"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.periodText, selected && styles.periodTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View>
          <Text accessibilityRole="header" style={[styles.sectionTitle, styles.chartTitle]}>{tr("Earnings Chart")}</Text>
          <EarningsBarChart
            bars={chartBars}
            theme={theme}
            isUrdu={isUrdu}
            formatNumber={formatNumber}
            label={tr("Earnings chart for {{period}}", { period: periods.find((option) => option.value === period)?.label || "" })}
          />
        </View>

        <Text accessibilityRole="header" style={styles.sectionTitle}>{tr("Completed Jobs")}</Text>
        {completedBookings.map((transaction: any) => (
          <View
            key={transaction.id}
            style={styles.txCard}
            accessible
            accessibilityLabel={`${transaction.service}, ${transaction.customerName}, ${formatCurrency(Number(transaction.providerAmount ?? transaction.price ?? 0))}`}
          >
            <View style={styles.txIcon}>
              <Icon name="briefcase" size={18} color={theme.colors.secondary} />
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txService}>{transaction.service}</Text>
              <Text style={styles.txCustomer}>{tr("Customer: {{name}}", { name: transaction.customerName })}</Text>
              <Text style={styles.txDate}>{transaction.scheduledDate ? formatDate(transaction.scheduledDate) : tr("Recent")}</Text>
            </View>
            <View style={styles.txRight}>
              <Text style={styles.txAmount}>{formatCurrency(Number(transaction.providerAmount ?? transaction.price ?? 0))}</Text>
              <View style={styles.txBreakdown}>
                <Text style={styles.txBreakdownText}>
                  {tr("Gross {{gross}} · Athoo {{commission}}", {
                    gross: formatCurrency(Number(transaction.price || 0)),
                    commission: formatCurrency(Number(transaction.commissionAmount || 0)),
                  })}
                </Text>
              </View>
              <View style={styles.paidBadge}><Text style={styles.paidText}>{tr("COMPLETED")}</Text></View>
            </View>
          </View>
        ))}

        {completedBookings.length === 0 ? (
          <View style={styles.empty} accessibilityRole="text">
            <Icon name="dollar-sign" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{tr("No Earnings Yet")}</Text>
            <Text style={styles.emptySubtitle}>{tr("Complete jobs to see your provider earnings and Athoo commission here.")}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createChartStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    container: { backgroundColor: theme.colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
    bars: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-end", height: 120, gap: 4 },
    barCol: { flex: 1, alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" },
    barAmt: { fontSize: 8, color: theme.colors.textMuted, fontWeight: "600" },
    barTrack: { width: "100%", flex: 1, justifyContent: "flex-end", borderRadius: 5, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt, maxWidth: 28 },
    barFill: { width: "100%", borderRadius: 5, minHeight: 0 },
    barLabel: { fontSize: 8, color: theme.colors.textSecondary, fontWeight: "600", marginTop: 2, writingDirection: isUrdu ? "rtl" : "ltr" },
  });
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    scroll: { flex: 1 },
    content: { padding: 16, gap: 14, paddingBottom: 60 },
    earningsCard: { borderRadius: 22, padding: 22, gap: 16 },
    earningsLabel: { fontSize: 13, color: "rgba(255,255,255,0.78)", fontWeight: "600", textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    earningsAmount: { fontSize: 38, fontWeight: "800", color: theme.colors.white, textAlign: isUrdu ? "right" : "left" },
    earningsRow: { flexDirection: isUrdu ? "row-reverse" : "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 12, alignItems: "center" },
    earningsStat: { flex: 1, alignItems: "center" },
    earningsStatVal: { fontSize: 15, fontWeight: "800", color: theme.colors.white, textAlign: "center" },
    earningsStatLbl: { fontSize: 10, color: "rgba(255,255,255,0.74)", fontWeight: "500", textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    pendingValue: { color: theme.colors.warningSoft },
    commissionValue: { color: theme.colors.successSoft },
    earningsDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.2)" },
    infoCard: { backgroundColor: theme.colors.infoSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.focusRing, gap: 6 },
    warningCard: { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning },
    infoRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 8 },
    infoText: { flex: 1, fontSize: 13, color: theme.colors.primary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    subInfoText: { fontSize: 12, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    warningText: { color: theme.colors.warning },
    bold: { fontWeight: "700" },
    periodRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 8 },
    periodBtn: { flex: 1, minHeight: 44, paddingHorizontal: 8, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
    periodBtnActive: { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary },
    periodText: { fontSize: 11, fontWeight: "600", color: theme.colors.textSecondary, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    periodTextActive: { color: theme.colors.white },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    chartTitle: { marginBottom: 10 },
    txCard: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "flex-start", gap: 12, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border },
    txIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.dark ? theme.colors.premiumSoft : theme.colors.premiumSoft, alignItems: "center", justifyContent: "center" },
    txInfo: { flex: 1, gap: 2 },
    txService: { fontSize: 14, fontWeight: "700", color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txCustomer: { fontSize: 12, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txDate: { fontSize: 11, color: theme.colors.textMuted, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txRight: { alignItems: isUrdu ? "flex-start" : "flex-end", gap: 3, maxWidth: "48%" },
    txAmount: { fontSize: 15, fontWeight: "800", color: theme.colors.success },
    txBreakdown: { backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    txBreakdownText: { fontSize: 9, color: theme.colors.textMuted, textAlign: isUrdu ? "left" : "right", writingDirection: isUrdu ? "rtl" : "ltr" },
    paidBadge: { backgroundColor: theme.colors.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    paidText: { fontSize: 10, fontWeight: "700", color: theme.colors.success, writingDirection: isUrdu ? "rtl" : "ltr" },
    empty: { alignItems: "center", paddingVertical: 56, gap: 10, backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.text, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    emptySubtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr", paddingHorizontal: 20 },
    pressed: { opacity: 0.82 },
  });
}
