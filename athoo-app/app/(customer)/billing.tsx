import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";

const FILTER_OPTIONS = ["All", "Completed", "Pending"] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function BillingScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [filter, setFilter] = useState<"All" | "Completed" | "Pending">("All");

  const all = user ? getMyBookings(user.id, "customer") : [];
  const filtered = all.filter((b) => {
    if (filter === "Completed") return b.status === "completed";
    if (filter === "Pending") return b.status === "pending" || b.status === "accepted";
    return true;
  });

  const totalSpent = all.filter((b) => b.status === "completed").reduce((s, b) => s + (b.price || 0), 0);
  const pending = all.filter((b) => b.status === "pending" || b.status === "accepted").reduce((s, b) => s + (b.price || 0), 0);

  const STATUS_COLOR: Record<string, string> = {
    completed: Colors.success,
    pending: Colors.warning,
    accepted: Colors.primary,
    in_progress: "#8B5CF6",
    cancelled: Colors.error,
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Billing & History</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        <AnimatedCard delay={80}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: Colors.primary }]}>
              <Icon name="dollar-sign" size={20} color="#fff" />
              <Text style={styles.summaryVal}>Rs. {totalSpent.toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>Total Spent</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: Colors.warning }]}>
              <Icon name="clock" size={20} color="#fff" />
              <Text style={styles.summaryVal}>{all.filter(b => b.status === "completed").length}</Text>
              <Text style={styles.summaryLabel}>Completed Jobs</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: Colors.secondary }]}>
              <Icon name="alert-circle" size={20} color="#fff" />
              <Text style={styles.summaryVal}>{all.filter(b => ["pending","accepted"].includes(b.status)).length}</Text>
              <Text style={styles.summaryLabel}>Active</Text>
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard delay={150}>
          <View style={styles.filterRow}>
            {FILTER_OPTIONS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterChip, filter === f && styles.filterActive]}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </AnimatedCard>

        {filtered.length === 0 ? (
          <AnimatedCard delay={200}>
            <View style={styles.empty}>
              <Icon name="file-text" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptyText}>Your billing history will appear here</Text>
            </View>
          </AnimatedCard>
        ) : (
          filtered.map((b, i) => (
            <AnimatedCard key={b.id} delay={200 + i * 50}>
              <Pressable
                style={({ pressed }) => [styles.txCard, pressed && styles.pressed]}
                onPress={() => router.push({
                  pathname: "/(customer)/booking-detail",
                  params: { bookingId: b.id },
                })}
              >
                <View style={[styles.txIcon, { backgroundColor: STATUS_COLOR[b.status] + "20" }]}>
                  <Icon name={b.serviceIcon as any} size={20} color={STATUS_COLOR[b.status]} />
                </View>
                <View style={styles.txContent}>
                  <Text style={styles.txService}>{b.service}</Text>
                  <Text style={styles.txProvider}>{b.providerName}</Text>
                  <Text style={styles.txDate}>{formatDate(b.createdAt)}</Text>
                </View>
                <View style={styles.txRight}>
                  {b.price ? (
                    <Text style={styles.txAmount}>Rs. {b.price.toLocaleString()}</Text>
                  ) : (
                    <Text style={styles.txAmountPending}>TBD</Text>
                  )}
                  <View style={[styles.txStatus, { backgroundColor: STATUS_COLOR[b.status] + "20" }]}>
                    <Text style={[styles.txStatusText, { color: STATUS_COLOR[b.status] }]}>
                      {b.status === "in_progress" ? "Active" : b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </AnimatedCard>
          ))
        )}

        <AnimatedCard delay={320}>
          <View style={styles.securityNote}>
            <Icon name="lock" size={14} color={Colors.primary} />
            <Text style={styles.securityText}>
              Payments are made directly to the provider in cash. Athoo never handles your money or stores payment details.
            </Text>
          </View>
        </AnimatedCard>
      </ScrollView>
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  scroll: { padding: 20, gap: 14, paddingBottom: 60 },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  summaryVal: { fontSize: 16, fontWeight: "800", color: "#fff" },
  summaryLabel: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.8)", textAlign: "center" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  filterTextActive: { color: "#fff" },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  txIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  txContent: { flex: 1, gap: 2 },
  txService: { fontSize: 14, fontWeight: "700", color: Colors.text },
  txProvider: { fontSize: 12, color: Colors.textSecondary },
  txDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  txRight: { alignItems: "flex-end", gap: 4 },
  txAmount: { fontSize: 15, fontWeight: "800", color: Colors.text },
  txAmountPending: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  txStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  txStatusText: { fontSize: 10, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textSecondary },
  securityNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  securityText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 17 },
});

