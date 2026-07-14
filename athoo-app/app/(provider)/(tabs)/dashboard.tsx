import { Icon } from "@/components/ui/Icon";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { BookingCard } from "@/components/ui/BookingCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { useBroadcast } from "@/context/BroadcastContext";
import { api, realtime } from "@/services/api";

export default function ProviderDashboard() {
  const { user, refreshUser } = useAuth();
  const { getMyBookings, pendingAlerts, consumeAlerts } = useBookings();
  const { pendingAlerts: negAlerts, consumeNegAlerts } = useNegotiation();
  const { t } = useLang();
  const { push, unreadCount } = useNotifications();
  const { openBroadcastCount, latestBroadcast, dismissLatestBroadcast } = useBroadcast();
  const [broadcastPopup, setBroadcastPopup] = useState<any>(null);
  const prevBroadcastId = useRef<string | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (refresh = false) => {
    refresh ? setDashboardRefreshing(true) : setDashboardLoading(true);
    setDashboardError(null);
    try {
      const response = await api.getProviderDashboard();
      setDashboard(response.dashboard);
      if (typeof response.dashboard?.provider?.isAvailable === "boolean") {
        setIsAvailable(response.dashboard.provider.isAvailable);
      }
    } catch (error: any) {
      setDashboardError(error?.message || "Could not load provider dashboard");
    } finally {
      setDashboardLoading(false);
      setDashboardRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadDashboard(false); }, [loadDashboard]));

  useEffect(() => {
    if (latestBroadcast && latestBroadcast.id !== prevBroadcastId.current) {
      prevBroadcastId.current = latestBroadcast.id;
      setBroadcastPopup(latestBroadcast);
    }
  }, [latestBroadcast]);

  useEffect(() => {
    if (pendingAlerts.length > 0) {
      const alerts = consumeAlerts();
      for (const alert of alerts) {
        push({
          type: alert.type === "booking" ? "booking" : "success",
          title: alert.title,
          message: alert.message,
          role: "provider",
          bookingId: alert.booking.id,
        });
      }
    }

    if (negAlerts.length > 0) {
      const alerts = consumeNegAlerts();
      for (const alert of alerts) {
        push({
          type: "negotiation",
          title: alert.title,
          message: alert.message,
          role: "provider",
          negotiationId: alert.negotiation.id,
        });
      }
    }
  }, [pendingAlerts, negAlerts, consumeAlerts, consumeNegAlerts, push]);

  const [isAvailable, setIsAvailable] = useState(user?.isAvailable !== false);

  useEffect(() => {
    setIsAvailable(user?.isAvailable !== false);
  }, [user?.isAvailable]);


  useEffect(() => {
    const off = realtime.on((event: any) => {
      if (event?.type === "provider:availability") {
        const next = event?.payload?.isAvailable;
        if (typeof next === "boolean") {
          setIsAvailable(next);
          refreshUser().catch(() => undefined);
          loadDashboard(true).catch(() => undefined);
        }
      }
      if (event?.type === "booking:updated" && event?.payload?.booking?.providerId === user?.id) {
        const status = String(event.payload.booking.status || "");
        if (["accepted", "on_the_way", "arrived", "started", "in_progress"].includes(status)) {
          setIsAvailable(false);
          refreshUser().catch(() => undefined);
          loadDashboard(true).catch(() => undefined);
        }
        if (["completed", "cancelled"].includes(status)) {
          setIsAvailable(true);
          refreshUser().catch(() => undefined);
          loadDashboard(true).catch(() => undefined);
        }
      }
    });
    return off;
  }, [user?.id, refreshUser, loadDashboard]);

  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const pending = allBookings.filter((b) => b.status === "pending");
  const active = allBookings.filter(
    (b) => ["accepted", "on_the_way", "arrived", "started", "in_progress"].includes(String(b.status))
  );
  const completed = allBookings.filter((b) => b.status === "completed");

  const summary = dashboard?.summary || {};
  const totalJobs = Number(summary.totalJobs ?? allBookings.length);
  const pendingJobs = Number(summary.pendingJobs ?? pending.length);
  const completedJobs = Number(summary.completedJobs ?? completed.length);
  const totalEarnings = Number(summary.netEarnings ?? completed.reduce((sum, b) => sum + (b.providerAmount || b.price || 0), 0));
  const weekBars: { label: string; amount: number }[] = Array.isArray(dashboard?.week) && dashboard.week.length
    ? dashboard.week
    : [];
  const maxBarAmt = Math.max(...weekBars.map((b) => Number(b.amount || 0)), 1);
  const completionRate = Number(summary.completionRate ?? (allBookings.length > 0 ? Math.round((completed.length / allBookings.length) * 100) : 0));

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Broadcast New Job Popup */}
      <Modal visible={!!broadcastPopup} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View style={styles.popupIconRow}>
              <View style={styles.popupIconBg}>
                <Icon name="radio" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.popupTitle}>New Broadcast Job!</Text>
                <Text style={styles.popupSub}>{broadcastPopup?.serviceLabel ?? "Service request"}</Text>
              </View>
            </View>
            {broadcastPopup?.address ? (
              <View style={styles.popupRow}>
                <Icon name="map-pin" size={13} color={Colors.primary} />
                <Text style={styles.popupRowText} numberOfLines={2}>{broadcastPopup.address}</Text>
              </View>
            ) : null}
            {broadcastPopup?.scheduledDate ? (
              <View style={styles.popupRow}>
                <Icon name="calendar" size={13} color={Colors.primary} />
                <Text style={styles.popupRowText}>{broadcastPopup.scheduledDate} at {broadcastPopup.scheduledTime}</Text>
              </View>
            ) : null}
            {broadcastPopup?.customerOffer ? (
              <View style={styles.popupRow}>
                <Icon name="dollar-sign" size={13} color={Colors.secondary} />
                <Text style={[styles.popupRowText, { color: Colors.secondary, fontWeight: "700" }]}>
                  Customer Offer: Rs. {Number(broadcastPopup.customerOffer).toLocaleString()}
                </Text>
              </View>
            ) : null}
            <View style={styles.popupBtns}>
              <Pressable
                style={styles.popupDismiss}
                onPress={() => { setBroadcastPopup(null); dismissLatestBroadcast(); }}
              >
                <Text style={styles.popupDismissText}>Dismiss</Text>
              </Pressable>
              <Pressable
                style={styles.popupView}
                onPress={() => {
                  setBroadcastPopup(null);
                  dismissLatestBroadcast();
                  router.push("/(provider)/broadcast-jobs" as any);
                }}
              >
                <Text style={styles.popupViewText}>View Job</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t.providerDashboard}</Text>
          <Text style={styles.subGreeting}>{user?.name}</Text>
        </View>

        <Pressable
          style={styles.notifBtn}
          onPress={() => router.push("/(provider)/notifications")}
        >
          <Icon name="bell" size={20} color={Colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={dashboardRefreshing} onRefresh={() => loadDashboard(true)} />}
      >
        {dashboardError ? (
          <Pressable style={styles.dashboardError} onPress={() => loadDashboard(true)} accessibilityRole="button" testID="provider-dashboard-retry">
            <Icon name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.dashboardErrorText}>{dashboardError}. Tap to retry.</Text>
          </Pressable>
        ) : null}
        <View
          style={[
            styles.statusCard,
            {
              borderColor: isAvailable
                ? Colors.success + "60"
                : Colors.error + "40",
              backgroundColor: isAvailable ? "#F0FDF4" : "#FFF5F5",
            },
          ]}
        >
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: isAvailable ? Colors.success : Colors.error },
              ]}
            />
            <View>
              <Text
                style={[
                  styles.statusText,
                  { color: isAvailable ? Colors.success : Colors.error },
                ]}
              >
                {isAvailable ? t.availableForJobs : t.notAvailable}
              </Text>
              <Text style={styles.statusSub}>
                {isAvailable ? t.customersCanBook : t.wontReceive}
              </Text>
            </View>
          </View>
          <Switch
            value={isAvailable}
            disabled={active.length > 0 && isAvailable === false}
            onValueChange={async (val) => {
              try {
                if (val && active.length > 0) {
                  Alert.alert("Busy on active job", `You are currently busy on job #${String(active[0]?.publicId || active[0]?.id || "current").slice(-10)}. Complete this job before going available.`);
                  return;
                }
                const res: any = await api.updateAvailability(val);
                const next = !!res?.user?.isAvailable;
                setIsAvailable(next);
                await refreshUser();
                await loadDashboard(true);
              } catch (e: any) {
                setIsAvailable(user?.isAvailable !== false);
                Alert.alert("Availability", e?.message || "You cannot turn available while busy on an active job.");
              }
            }}
            trackColor={{
              false: Colors.error + "50",
              true: Colors.success + "50",
            }}
            thumbColor={isAvailable ? Colors.success : Colors.error}
          />
        </View>

        {/* Broadcast Jobs Banner */}
        <Pressable
          style={styles.broadcastBanner}
          onPress={() => router.push("/(provider)/broadcast-jobs" as any)}
        >
          <View style={styles.broadcastBannerLeft}>
            <View style={styles.broadcastBannerIcon}>
              <Icon name="radio" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.broadcastBannerTitle}>
                Broadcast Jobs{openBroadcastCount > 0 ? ` (${openBroadcastCount})` : ""}
              </Text>
              <Text style={styles.broadcastBannerSub}>
                {openBroadcastCount > 0
                  ? `${openBroadcastCount} open request${openBroadcastCount > 1 ? "s" : ""} near you`
                  : "Tap to see open requests near you"}
              </Text>
            </View>
          </View>
          <Icon name="arrow-right" size={18} color={Colors.secondary} />
        </Pressable>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: Colors.primary + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>
              {dashboardLoading ? "—" : totalJobs}
            </Text>
            <Text style={styles.statLabel}>{t.totalJobs}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.warning + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.warning }]}>
              {dashboardLoading ? "—" : pendingJobs}
            </Text>
            <Text style={styles.statLabel}>{t.pendingJobs}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.success + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.success }]}>
              {dashboardLoading ? "—" : completedJobs}
            </Text>
            <Text style={styles.statLabel}>{t.done}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.secondary + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.secondary }]}>
              {totalEarnings > 0 ? `${Math.round(totalEarnings / 1000)}k` : "0"}
            </Text>
            <Text style={styles.statLabel}>{t.earned}</Text>
          </View>
        </View>

        {/* 7-day earnings chart */}
        <View style={styles.earningsChart}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Earnings This Week</Text>
            <Text style={styles.chartTotal}>
              {weekBars.reduce((sum, day) => sum + Number(day.amount || 0), 0) > 0 ? `Rs. ${weekBars.reduce((sum, day) => sum + Number(day.amount || 0), 0).toLocaleString("en-PK")}` : "Rs. 0"} this week
            </Text>
          </View>
          <View style={styles.chartBars}>
            {(weekBars.length ? weekBars : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(label => ({ label, amount: 0 }))).map((bar, i) => {
              const pct = Math.max(0.04, bar.amount / maxBarAmt);
              const isToday = i === 6;
              return (
                <View key={bar.label} style={styles.chartBarCol}>
                  <Text style={styles.chartBarAmt}>
                    {bar.amount > 0 ? `${Math.round(bar.amount / 1000)}k` : ""}
                  </Text>
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBarFill, { height: `${pct * 100}%` as any, backgroundColor: isToday ? Colors.primary : Colors.primary + "55" }]} />
                  </View>
                  <Text style={[styles.chartBarLabel, isToday && { color: Colors.primary, fontWeight: "700" }]}>{bar.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t.newRequests} ({pending.length})
            </Text>
            {pending.slice(0, 2).map((b, i) => (
              <BookingCard
                key={`${b.id}-${i}`}
                booking={b}
                role="provider"
                onPress={() =>
                  router.push({
                    pathname: "/(provider)/job-detail",
                    params: { bookingId: b.id },
                  })
                }
              />
            ))}
          </View>
        )}

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.activeJobs}</Text>
            {active.map((b, i) => (
              <BookingCard
                key={`${b.id}-${i}`}
                booking={b}
                role="provider"
                onPress={() =>
                  router.push({
                    pathname: "/(provider)/job-detail",
                    params: { bookingId: b.id },
                  })
                }
              />
            ))}
          </View>
        )}

        {allBookings.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="briefcase" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t.noJobsYet}</Text>
            <Text style={styles.emptySubtitle}>{t.noJobsYetSub}</Text>
          </View>
        )}

        <View style={styles.performanceCard}>
          <Text style={styles.perfTitle}>{t.yourPerformance}</Text>
          <View style={styles.perfRow}>
            <Icon name="star" size={16} color={Colors.accent} />
            <Text style={styles.perfLabel}>Avg Rating</Text>
            <Text style={styles.perfVal}>{user?.rating || "N/A"}</Text>
          </View>
          <View style={styles.perfRow}>
            <Icon name="clock" size={16} color={Colors.primary} />
            <Text style={styles.perfLabel}>Response Time</Text>
            <Text style={styles.perfVal}>~15 min</Text>
          </View>
          <View style={styles.perfRow}>
            <Icon name="check-circle" size={16} color={Colors.success} />
            <Text style={styles.perfLabel}>Completion Rate</Text>
            <Text style={styles.perfVal}>{completionRate}%</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  dashboardError: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.error + "10", borderWidth: 1, borderColor: Colors.error + "30" },
  dashboardErrorText: { flex: 1, color: Colors.error, fontSize: 12, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 18, fontWeight: "800", color: Colors.text },
  subGreeting: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  notifBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "800",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 16 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: { fontSize: 14, fontWeight: "700" },
  statusSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statVal: { fontSize: 24, fontWeight: "800" },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  section: { gap: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 10,
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  performanceCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  perfTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  perfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  perfLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  perfVal: { fontSize: 14, fontWeight: "700", color: Colors.text },

  earningsChart: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.border },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  chartTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  chartTotal: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 },
  chartBarCol: { flex: 1, alignItems: "center", gap: 4 },
  chartBarAmt: { fontSize: 9, color: Colors.textSecondary, fontWeight: "600", height: 12, textAlign: "center" },
  chartBarTrack: { flex: 1, width: "100%", backgroundColor: Colors.surface, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 4 },
  chartBarLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "500" },
  broadcastBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.secondary + "12",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.secondary + "40",
  },
  broadcastBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  broadcastBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastBannerTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  broadcastBannerSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  popupCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 20,
    width: "100%",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  popupIconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  popupIconBg: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  popupTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  popupSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  popupRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  popupRowText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  popupBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  popupDismiss: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  popupDismissText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  popupView: {
    flex: 2, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.secondary, alignItems: "center",
  },
  popupViewText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
