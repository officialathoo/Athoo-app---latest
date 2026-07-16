import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Booking {
  id: string;
  service: string;
  customerName: string;
  status: string;
  price?: number;
  providerAmount?: number;
  commissionAmount?: number;
  scheduledDate: string;
  createdAt: string;
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { settings: platformSettings } = useSettings();
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [bookingResponse] = await Promise.all([
        api.getBookings(),
        refreshUser().catch(() => undefined),
      ]);
      setBookings((bookingResponse?.bookings || []) as Booking[]);
    } catch (loadError: any) {
      setError(loadError?.message || tr("Could not load wallet. Please try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  const completed = bookings.filter((booking) => booking.status === "completed");
  const totalEarned = completed.reduce((sum, booking) => sum + Number(booking.providerAmount || 0), 0);
  const totalCommissionPaid = Math.max(0, Number(user?.totalCommission || 0) - Number(user?.pendingCommission || 0));
  const pendingDues = Number(user?.pendingCommission || 0);
  const commissionLimit = Number(platformSettings.defaultCommissionLimit || user?.commissionLimit || 5000);
  const duesProgress = commissionLimit > 0 ? Math.min(1, pendingDues / commissionLimit) : 0;
  const remainingLimit = Math.max(0, commissionLimit - pendingDues);
  const recent = [...completed]
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={tr("Loading wallet") }>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={styles.loadingText}>{tr("Loading wallet…")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primaryPressed]}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr("Back")}
          >
            <Icon name="arrow-left" size={20} color={theme.colors.white} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>{tr("My Wallet")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard} accessibilityRole="summary">
          <Text style={styles.heroLabel}>{tr("Total Job Earnings")}</Text>
          <Text style={styles.heroValue}>{formatCurrency(totalEarned)}</Text>
          <Text style={styles.heroSub}>
            {tr("{{count}} completed jobs", { count: completed.length })}
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{formatCurrency(totalCommissionPaid)}</Text>
              <Text style={styles.heroStatLabel}>{tr("Paid to Athoo")}</Text>
            </View>
            <View style={styles.heroStatDiv} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatVal, pendingDues > 0 && styles.heroStatWarning]}>{formatCurrency(pendingDues)}</Text>
              <Text style={styles.heroStatLabel}>{tr("Pending Dues")}</Text>
            </View>
            <View style={styles.heroStatDiv} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{formatCurrency(remainingLimit)}</Text>
              <Text style={styles.heroStatLabel}>{tr("Dues Remaining")}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        )}
      >
        {error ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Icon name="alert-circle" size={20} color={theme.colors.danger} />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>{tr("Wallet unavailable")}</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={tr("Retry")}
            >
              <Text style={styles.retryText}>{tr("Retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {pendingDues > 0 ? (
          <View style={styles.duesCard}>
            <View style={styles.duesTop}>
              <View style={styles.duesIcon}>
                <Icon name="alert-triangle" size={16} color={theme.colors.warning} />
              </View>
              <View style={styles.duesCopy}>
                <Text style={styles.duesTitle}>{tr("Commission Dues Outstanding")}</Text>
                <Text style={styles.duesSub}>{tr("Pay Athoo to keep your account active")}</Text>
              </View>
              <Text style={styles.duesAmt}>{formatCurrency(pendingDues)}</Text>
            </View>
            <View
              style={styles.progressBg}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={tr("Commission limit used")}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(duesProgress * 100) }}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(duesProgress * 100)}%`,
                    backgroundColor: duesProgress > 0.8 ? theme.colors.danger : theme.colors.warning,
                  },
                ]}
              />
            </View>
            <Text style={styles.duesLimit}>
              {tr("Limit: {{amount}} · {{percent}}% used", {
                amount: formatCurrency(commissionLimit),
                percent: Math.round(duesProgress * 100),
              })}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.payDuesBtn, pressed && styles.pressed]}
              onPress={() => router.push("/(provider)/pay-commission" as any)}
              accessibilityRole="button"
              accessibilityLabel={tr("Pay Commission Dues")}
            >
              <Icon name="credit-card" size={15} color={theme.colors.white} />
              <Text style={styles.payDuesBtnText}>{tr("Pay Commission Dues")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <WalletAction
            icon="trending-up"
            label={tr("Earnings History")}
            colors={[theme.colors.success, theme.colors.success]}
            onPress={() => router.push("/(provider)/earnings" as any)}
            styles={styles}
            white={theme.colors.white}
          />
          <WalletAction
            icon="file-text"
            label={tr("View Invoices")}
            colors={[theme.colors.accent, theme.colors.accent]}
            onPress={() => router.push("/(provider)/invoices" as any)}
            styles={styles}
            white={theme.colors.white}
          />
          <WalletAction
            icon="headphones"
            label={tr("Finance Support")}
            colors={[theme.colors.warning, theme.colors.warning]}
            onPress={() => router.push("/(provider)/contact-support" as any)}
            styles={styles}
            white={theme.colors.white}
          />
        </View>

        <View style={styles.statsGrid} accessibilityRole="summary">
          <View style={styles.statCard}>
            <Icon name="briefcase" size={18} color={theme.colors.primary} />
            <Text style={styles.statVal}>{completed.length}</Text>
            <Text style={styles.statLabel}>{tr("Jobs Done")}</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="dollar-sign" size={18} color={theme.colors.success} />
            <Text style={[styles.statVal, { color: theme.colors.success }]}>{formatCurrency(totalEarned)}</Text>
            <Text style={styles.statLabel}>{tr("Total Earned")}</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="percent" size={18} color={theme.colors.warning} />
            <Text style={[styles.statVal, { color: theme.colors.warning }]}>{formatCurrency(Number(user?.totalCommission || 0))}</Text>
            <Text style={styles.statLabel}>{tr("Commission Total")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{tr("Recent Earnings")}</Text>
          {recent.length === 0 ? (
            <View style={styles.empty} accessibilityRole="text">
              <Icon name="inbox" size={32} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>{tr("Complete jobs to see your earnings here")}</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {recent.map((booking, index) => (
                <View key={booking.id} style={[styles.txRow, index < recent.length - 1 && styles.txBorder]}>
                  <View style={styles.txIcon}>
                    <Icon name="check-circle" size={16} color={theme.colors.success} />
                  </View>
                  <View style={styles.txCopy}>
                    <Text style={styles.txTitle} numberOfLines={1}>{booking.service} · {booking.customerName}</Text>
                    <Text style={styles.txDate}>{formatDate(booking.createdAt)}</Text>
                  </View>
                  <View style={styles.txAmounts}>
                    <Text style={styles.txAmt}>+{formatCurrency(Number(booking.providerAmount || 0))}</Text>
                    {booking.commissionAmount != null && booking.commissionAmount > 0 ? (
                      <Text style={styles.txComm}>-{formatCurrency(booking.commissionAmount)} {tr("commission")}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

interface WalletActionProps {
  icon: string;
  label: string;
  colors: readonly [string, string];
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  white: string;
}

function WalletAction({ icon, label, colors, onPress, styles, white }: WalletActionProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient colors={colors} style={styles.actionGrad}>
        <Icon name={icon as any} size={22} color={white} />
      </LinearGradient>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, backgroundColor: theme.colors.background },
    loadingText: { color: theme.colors.textSecondary, fontSize: 13, writingDirection: isUrdu ? "rtl" : "ltr" },
    header: { paddingHorizontal: 20, paddingBottom: 24 },
    headerRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.white, flex: 1, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    headerSpacer: { width: 44 },
    heroCard: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
    heroLabel: { fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    heroValue: { fontSize: 34, fontWeight: "800", color: theme.colors.white, marginTop: 4, marginBottom: 2, textAlign: isUrdu ? "right" : "left" },
    heroSub: { fontSize: 13, color: "rgba(255,255,255,0.78)", marginBottom: 16, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    heroStats: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center" },
    heroStat: { flex: 1, alignItems: "center" },
    heroStatVal: { fontSize: 14, fontWeight: "700", color: theme.colors.white, marginBottom: 2, textAlign: "center" },
    heroStatWarning: { color: theme.colors.warningSoft },
    heroStatLabel: { fontSize: 10, color: "rgba(255,255,255,0.72)", fontWeight: "500", textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    heroStatDiv: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.3)" },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 24 },
    errorCard: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.dangerSoft, borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.danger },
    errorContent: { flex: 1 },
    errorTitle: { color: theme.colors.danger, fontWeight: "800", fontSize: 13, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    errorText: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    retryBtn: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: theme.colors.surface },
    retryText: { color: theme.colors.primary, fontWeight: "700", fontSize: 12 },
    duesCard: { backgroundColor: theme.colors.warningSoft, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.warning },
    duesTop: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 10 },
    duesIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.dark ? theme.colors.warningSoft : theme.colors.warningSoft, justifyContent: "center", alignItems: "center" },
    duesCopy: { flex: 1 },
    duesTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.warning, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    duesSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    duesAmt: { fontSize: 15, fontWeight: "800", color: theme.colors.warning },
    progressBg: { height: 8, backgroundColor: theme.colors.surface, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
    progressFill: { height: "100%", borderRadius: 4 },
    duesLimit: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 10, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    payDuesBtn: { minHeight: 44, flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.colors.warning, borderRadius: 10, paddingHorizontal: 14 },
    payDuesBtnText: { fontSize: 13, fontWeight: "700", color: theme.colors.white, writingDirection: isUrdu ? "rtl" : "ltr" },
    actionsRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 10, marginBottom: 14 },
    actionBtn: { flex: 1, minHeight: 88, alignItems: "center", justifyContent: "flex-start", gap: 8, paddingVertical: 4 },
    actionGrad: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center" },
    actionLabel: { fontSize: 11, fontWeight: "600", color: theme.colors.text, textAlign: "center", lineHeight: 15, writingDirection: isUrdu ? "rtl" : "ltr" },
    statsGrid: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 10, marginBottom: 16 },
    statCard: { flex: 1, minHeight: 104, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 12, alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm },
    statVal: { fontSize: 13, fontWeight: "800", color: theme.colors.primary, textAlign: "center" },
    statLabel: { fontSize: 10, color: theme.colors.textSecondary, textAlign: "center", fontWeight: "500", writingDirection: isUrdu ? "rtl" : "ltr" },
    section: { marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, marginBottom: 12, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    empty: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: theme.colors.border },
    emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    txList: { backgroundColor: theme.colors.surface, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border },
    txRow: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, padding: 14 },
    txBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
    txIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.successSoft, justifyContent: "center", alignItems: "center" },
    txCopy: { flex: 1 },
    txTitle: { fontSize: 13, fontWeight: "600", color: theme.colors.text, marginBottom: 2, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txDate: { fontSize: 11, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txAmounts: { alignItems: isUrdu ? "flex-start" : "flex-end" },
    txAmt: { fontSize: 14, fontWeight: "700", color: theme.colors.success, marginBottom: 1 },
    txComm: { fontSize: 11, color: theme.colors.textSecondary, writingDirection: isUrdu ? "rtl" : "ltr" },
    pressed: { opacity: 0.82 },
  });
}
