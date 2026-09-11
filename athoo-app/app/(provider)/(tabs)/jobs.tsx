import { Icon } from "@/components/ui/Icon";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, ProviderJobsSkeleton, ProviderMetricCard } from "@/components/design";
import { EmptyView } from "@/components/ui/UiState";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";
import type { AthooTheme } from "@/design/theme";
import { useLang } from "@/context/LanguageContext";
import { BookingCard } from "@/components/ui/BookingCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings, BookingStatus } from "@/context/BookingContext";
import { useNegotiation } from "@/context/NegotiationContext";

const FILTERS: {
  label: string;
  value: BookingStatus | "all" | "live" | "negotiations";
}[] = [
  { label: "All", value: "all" },
  { label: "Live", value: "live" },
  { label: "Pending", value: "pending" },
  { label: "Active", value: "accepted" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Negotiations", value: "negotiations" },
];

export default function ProviderJobsScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t, translate: tr } = useLang();
  const { getMyBookings, loadBookings, isLoading, hasMore, isLoadingMore, loadMoreBookings } = useBookings();
  const { getMyNegotiations } = useNegotiation();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [activeFilter, setActiveFilter] =
    useState<typeof FILTERS[0]["value"]>("all");
  const [refreshing, setRefreshing] = useState(false);
  const lastFocusRefreshAtRef = useRef(0);

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const myNegotiations = user ? getMyNegotiations(user.id) : [];
  const liveBookings = allBookings.filter((b) => b.status === "in_progress");
  const pendingCount = allBookings.filter((b) => b.status === "pending").length;
  const negCount = myNegotiations.filter(
    (n) => n.status === "customer_offer" || n.status === "provider_counter"
  ).length;

  const filters = FILTERS.map((filter) => ({
    ...filter,
    label: ({
      all: tr("All"),
      live: t.live,
      pending: t.pending,
      accepted: t.active,
      in_progress: t.inProgress,
      completed: t.completed,
      cancelled: t.cancelled,
      negotiations: tr("Negotiations"),
    } as Record<string, string>)[filter.value] ?? filter.label,
  }));

  const filtered =
    activeFilter === "all"
      ? allBookings
      : activeFilter === "live"
      ? liveBookings
      : activeFilter === "negotiations"
      ? []
      : allBookings.filter((b) => b.status === activeFilter);


  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFocusRefreshAtRef.current >= 30_000) {
        lastFocusRefreshAtRef.current = now;
        void loadBookings({ silent: true });
      }
      return undefined;
    }, [loadBookings])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBookings({ silent: true });
      lastFocusRefreshAtRef.current = Date.now();
    } finally {
      setRefreshing(false);
    }
  }, [loadBookings]);

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <AppText variant="h2" style={{ flex: 1 }}>{t.myJobs}</AppText>
        {pendingCount + negCount > 0 && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertText}>{pendingCount + negCount} {tr("new")}</Text>
          </View>
        )}
      </View>

      <View style={[styles.summaryRow, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <ProviderMetricCard testID="provider-jobs-total" label={tr("Total")} value={allBookings.length} />
        <ProviderMetricCard testID="provider-jobs-live" label={t.live} value={liveBookings.length} tone="danger" />
        <ProviderMetricCard testID="provider-jobs-pending" label={t.pending} value={pendingCount} tone="warning" />
        <ProviderMetricCard
          testID="provider-jobs-completed"
          label={t.doneLabel}
          value={allBookings.filter((b) => b.status === "completed").length}
          tone="success"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { backgroundColor: theme.colors.surface }]}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((f) => {
          const isActive = activeFilter === f.value;
          const hasAlert =
            (f.value === "pending" && pendingCount > 0) ||
            (f.value === "negotiations" && negCount > 0);

          return (
            <Pressable
              key={f.value}
              onPress={() => setActiveFilter(f.value)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={f.label}
            >
              <Text
                style={[styles.filterText, { color: theme.colors.textSecondary }, isActive && styles.filterTextActive]}
              >
                {f.label}
              </Text>

              {hasAlert && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {f.value === "pending" ? pendingCount : negCount}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
      >
        {isLoading && allBookings.length === 0 && activeFilter !== "negotiations" ? (
          <ProviderJobsSkeleton />
        ) : activeFilter === "negotiations" ? (
          myNegotiations.length === 0 ? (
            <EmptyView
              compact
              icon="dollar-sign"
              title={tr("No negotiations")}
              message={tr("Customer price offers will appear here when a booking enters negotiation.")}
            />
          ) : (
            myNegotiations.map((neg, i) => (
              <Pressable
                key={`${neg.id}-${i}`}
                style={({ pressed }) => [
                  styles.negCard,
                  pressed && styles.negCardPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/(provider)/negotiations",
                    params: { negId: neg.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${tr("Negotiation")} - ${neg.service}`}
              >
                <View style={styles.negHeader}>
                  <View style={styles.negIcon}>
                    <Icon name="dollar-sign" size={18} color={theme.colors.secondary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.negService} numberOfLines={1}>{neg.service}</Text>
                    <Text style={styles.negCustomer} numberOfLines={1}>{tr("From")}: {neg.customerName}</Text>
                  </View>

                  <View
                    style={[
                      styles.negStatusBadge,
                      {
                        backgroundColor:
                          neg.status === "customer_offer"
                            ? theme.colors.warningSoft
                            : neg.status === "provider_counter"
                            ? theme.colors.infoSoft
                            : neg.status === "accepted"
                            ? theme.colors.successSoft
                            : theme.colors.dangerSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.negStatusText,
                        {
                          color:
                            neg.status === "customer_offer"
                              ? theme.colors.warning
                              : neg.status === "provider_counter"
                              ? theme.colors.info
                              : neg.status === "accepted"
                              ? theme.colors.success
                              : theme.colors.danger,
                        },
                      ]}
                    >
                      {neg.status === "customer_offer"
                        ? tr("Offer")
                        : neg.status === "provider_counter"
                        ? tr("Countered")
                        : neg.status === "accepted"
                        ? t.accepted
                        : tr("Rejected")}
                    </Text>
                  </View>
                </View>

                <View style={styles.negAmounts}>
                  <View style={styles.negAmount}>
                    <Text style={styles.negAmountLabel}>{tr("Customer Offer")}</Text>
                    <Text style={[styles.negAmountVal, { color: theme.colors.primary }]}>
                      {tr("Rs.")} {neg.customerOffer}
                    </Text>
                  </View>

                  {neg.providerCounter !== undefined ? (
                    <View style={styles.negAmount}>
                      <Text style={styles.negAmountLabel}>{tr("Your Counter")}</Text>
                      <Text
                        style={[styles.negAmountVal, { color: theme.colors.secondary }]}
                      >
                        {tr("Rs.")} {neg.providerCounter}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {neg.status === "customer_offer" && (
                  <View style={styles.negActions}>
                    <Pressable
                      style={styles.negAcceptBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/(provider)/negotiations",
                          params: { negId: neg.id, action: "accept" },
                        })
                      }
                    >
                      <Icon name="check" size={14} color={theme.colors.onBrand} />
                      <Text style={styles.negAcceptText}>{t.accept}</Text>
                    </Pressable>

                    <Pressable
                      style={styles.negCounterBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/(provider)/negotiations",
                          params: { negId: neg.id, action: "counter" },
                        })
                      }
                    >
                      <Icon name="refresh-cw" size={14} color={theme.colors.secondary} />
                      <Text style={styles.negCounterText}>{t.counter}</Text>
                    </Pressable>

                    <Pressable
                      style={styles.negRejectBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/(provider)/negotiations",
                          params: { negId: neg.id, action: "reject" },
                        })
                      }
                    >
                      <Icon name="x" size={14} color={theme.colors.danger} />
                      <Text style={styles.negRejectText}>{t.reject}</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            ))
          )
        ) : filtered.length === 0 ? (
          <EmptyView
            compact
            icon={activeFilter === "live" ? "radio" : "briefcase"}
            title={activeFilter === "live" ? tr("No live jobs") : tr("No jobs here")}
            message={activeFilter === "live"
              ? tr("You have no jobs in progress right now.")
              : tr("Jobs will appear here when customers book your services.")}
          />
        ) : (
          filtered.map((b, i) => (
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
          ))
        )}
        {activeFilter !== "negotiations" && hasMore ? (
          <Pressable
            accessibilityRole="button"
            disabled={isLoadingMore}
            style={[styles.loadMoreButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => void loadMoreBookings()}
          >
            <Icon name="chevrons-down" size={16} color={theme.colors.primary} />
            <Text style={[styles.loadMoreText, { color: theme.colors.primary }]}>
              {isLoadingMore ? tr("Loading older jobs...") : tr("Load older jobs")}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  loadMoreButton: {
    minHeight: redesign.control.standardHeight,
    borderWidth: redesign.visual.cardBorderWidth,
    borderRadius: radius.md,
    marginTop: redesign.layout.cardGap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...theme.shadows.sm,
  },
  loadMoreText: { fontSize: 14, fontWeight: "800" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: redesign.layout.cardGap,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: redesign.visual.cardBorderWidth,
    borderBottomColor: theme.colors.border,
    ...theme.shadows.sm,
  },

  title: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
    flex: 1,
  },

  alertBadge: {
    backgroundColor: theme.colors.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "25",
  },

  alertText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.danger,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: redesign.visual.cardBorderWidth,
    borderBottomColor: theme.colors.border,
  },

  summaryCard: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: "center",
  },

  summaryNum: {
    fontSize: 16,
    fontWeight: "800",
  },

  summaryLbl: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },

  filterScroll: {
    backgroundColor: theme.colors.surface,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 44,
    maxHeight: 52,
  },

  filterContent: {
    paddingLeft: redesign.layout.horizontalPadding,
    paddingRight: redesign.layout.horizontalPadding + 8,
    paddingVertical: 6,
    gap: 8,
    alignItems: "center",
    minHeight: redesign.control.standardHeight,
  },

  filterChip: {
    minHeight: redesign.control.compactHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },

  filterChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },

  filterText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  filterTextActive: {
    color: theme.colors.onBrand,
  },

  filterBadge: {
    backgroundColor: theme.colors.danger,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },

  filterBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.colors.onBrand,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: redesign.layout.cardGap,
    paddingBottom: 100,
    gap: redesign.layout.cardGap,
    width: "100%",
    maxWidth: redesign.layout.maxContentWidth,
    alignSelf: "center",
  },

  empty: {
    alignItems: "center",
    paddingVertical: 42,
    gap: 10,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },

  negCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    padding: redesign.layout.fieldGap,
    gap: 10,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.secondary + "30",
    ...theme.shadows.sm,
  },

  negCardPressed: {
    opacity: 0.82,
    transform: [{ scale: redesign.visual.pressedScale }],
  },

  negHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  negIcon: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.md,
    backgroundColor: theme.colors.premiumSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  negService: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    flexShrink: 1,
  },

  negCustomer: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },

  negStatusBadge: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },

  negStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  negAmounts: {
    flexDirection: "row",
    gap: 12,
  },

  negAmount: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: radius.md,
    padding: 9,
    alignItems: "center",
    gap: 2,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },

  negAmountLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },

  negAmountVal: {
    fontSize: 16,
    fontWeight: "800",
  },

  negActions: {
    flexDirection: "row",
    gap: 8,
  },

  negAcceptBtn: {
    flex: 1,
    minHeight: redesign.control.compactHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: theme.colors.success,
    borderRadius: radius.md,
    ...theme.shadows.sm,
  },

  negAcceptText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.onBrand,
  },

  negCounterBtn: {
    flex: 1,
    minHeight: redesign.control.compactHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: theme.colors.premiumSoft,
    borderRadius: radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.secondary + "40",
  },

  negCounterText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.secondary,
  },

  negRejectBtn: {
    flex: 1,
    minHeight: redesign.control.compactHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.danger + "30",
  },

  negRejectText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.danger,
  },
});
