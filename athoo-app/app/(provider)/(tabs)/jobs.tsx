import { Icon } from "@/components/ui/Icon";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { Colors } from "@/constants/colors";
import { AppText, ProviderJobsSkeleton, ProviderMetricCard } from "@/components/design";
import { EmptyView } from "@/components/ui/UiState";
import { useTheme } from "@/context/ThemeContext";
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
  const { getMyBookings, loadBookings, isLoading } = useBookings();
  const { getMyNegotiations } = useNegotiation();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [activeFilter, setActiveFilter] =
    useState<typeof FILTERS[0]["value"]>("all");

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const myNegotiations = user ? getMyNegotiations(user.id) : [];
  const liveBookings = allBookings.filter((b) => b.status === "in_progress");
  const pendingCount = allBookings.filter((b) => b.status === "pending").length;
  const negCount = myNegotiations.filter(
    (n) => n.status === "customer_offer" || n.status === "provider_counter"
  ).length;

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
      loadBookings();
      return undefined;
    }, [loadBookings])
  );

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <AppText variant="h2" style={{ flex: 1 }}>My Jobs</AppText>
        {pendingCount + negCount > 0 && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertText}>{pendingCount + negCount} new</Text>
          </View>
        )}
      </View>

      <View style={[styles.summaryRow, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <ProviderMetricCard testID="provider-jobs-total" label="Total" value={allBookings.length} />
        <ProviderMetricCard testID="provider-jobs-live" label="Live" value={liveBookings.length} tone="danger" />
        <ProviderMetricCard testID="provider-jobs-pending" label="Pending" value={pendingCount} tone="warning" />
        <ProviderMetricCard
          testID="provider-jobs-completed"
          label="Done"
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
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.value;
          const hasAlert =
            (f.value === "pending" && pendingCount > 0) ||
            (f.value === "negotiations" && negCount > 0);

          return (
            <Pressable
              key={f.value}
              onPress={() => setActiveFilter(f.value)}
              style={[styles.filterChip, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }, isActive && { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary }]}
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
          <RefreshControl refreshing={isLoading} onRefresh={loadBookings} />
        }
      >
        {isLoading && allBookings.length === 0 && activeFilter !== "negotiations" ? (
          <ProviderJobsSkeleton />
        ) : activeFilter === "negotiations" ? (
          myNegotiations.length === 0 ? (
            <EmptyView
              compact
              icon="dollar-sign"
              title="No negotiations"
              message="Customer price offers will appear here when a booking enters negotiation."
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
              >
                <View style={styles.negHeader}>
                  <View style={styles.negIcon}>
                    <Icon name="dollar-sign" size={18} color={Colors.secondary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.negService}>{neg.service}</Text>
                    <Text style={styles.negCustomer}>From: {neg.customerName}</Text>
                  </View>

                  <View
                    style={[
                      styles.negStatusBadge,
                      {
                        backgroundColor:
                          neg.status === "customer_offer"
                            ? "#FEF9C3"
                            : neg.status === "provider_counter"
                            ? "#EFF6FF"
                            : neg.status === "accepted"
                            ? "#F0FDF4"
                            : "#FEF2F2",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.negStatusText,
                        {
                          color:
                            neg.status === "customer_offer"
                              ? "#CA8A04"
                              : neg.status === "provider_counter"
                              ? Colors.primary
                              : neg.status === "accepted"
                              ? "#16A34A"
                              : "#DC2626",
                        },
                      ]}
                    >
                      {neg.status === "customer_offer"
                        ? "Offer"
                        : neg.status === "provider_counter"
                        ? "Countered"
                        : neg.status === "accepted"
                        ? "Accepted"
                        : "Rejected"}
                    </Text>
                  </View>
                </View>

                <View style={styles.negAmounts}>
                  <View style={styles.negAmount}>
                    <Text style={styles.negAmountLabel}>Customer Offer</Text>
                    <Text style={[styles.negAmountVal, { color: Colors.primary }]}>
                      Rs. {neg.customerOffer}
                    </Text>
                  </View>

                  {neg.providerCounter !== undefined ? (
                    <View style={styles.negAmount}>
                      <Text style={styles.negAmountLabel}>Your Counter</Text>
                      <Text
                        style={[styles.negAmountVal, { color: Colors.secondary }]}
                      >
                        Rs. {neg.providerCounter}
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
                      <Icon name="check" size={14} color="#fff" />
                      <Text style={styles.negAcceptText}>Accept</Text>
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
                      <Icon name="refresh-cw" size={14} color={Colors.secondary} />
                      <Text style={styles.negCounterText}>Counter</Text>
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
                      <Icon name="x" size={14} color={Colors.error} />
                      <Text style={styles.negRejectText}>Reject</Text>
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
            title={activeFilter === "live" ? "No live jobs" : "No jobs here"}
            message={activeFilter === "live"
              ? "You have no jobs in progress right now."
              : "Jobs will appear here when customers book your services."}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: Colors.white,
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    flex: 1,
  },

  alertBadge: {
    backgroundColor: Colors.error + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  alertText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.error,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },

  summaryNum: {
    fontSize: 18,
    fontWeight: "800",
  },

  summaryLbl: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  filterScroll: {
    backgroundColor: Colors.white,
  },

  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },

  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  filterChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },

  filterText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },

  filterTextActive: {
    color: Colors.white,
  },

  filterBadge: {
    backgroundColor: Colors.error,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  filterBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 12,
  },

  empty: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  negCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  negCardPressed: {
    opacity: 0.9,
  },

  negHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  negIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },

  negService: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },

  negCustomer: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  negStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
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
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    gap: 2,
  },

  negAmountLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#22C55E",
    borderRadius: 10,
    paddingVertical: 8,
  },

  negAcceptText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  negCounterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.secondary + "15",
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.secondary + "40",
  },

  negCounterText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.secondary,
  },

  negRejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.error + "10",
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.error + "30",
  },

  negRejectText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.error,
  },
});
