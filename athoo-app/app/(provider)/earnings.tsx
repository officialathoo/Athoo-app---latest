import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";

const PERIODS = ["This Week", "This Month", "All Time"];

type ChartBar = { label: string; amount: number };

function buildChartData(bookings: any[], period: string): ChartBar[] {
  const now = new Date();
  if (period === "This Week") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const buckets: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);
    bookings.forEach((b) => {
      const d = new Date(b.scheduledDate || b.createdAt || now);
      const diff = Math.floor((d.getTime() - startOfWeek.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) buckets[diff] = (buckets[diff] || 0) + Number(b.providerAmount ?? b.price ?? 0);
    });
    return days.map((label, i) => ({ label, amount: buckets[i] || 0 }));
  } else if (period === "This Month") {
    const weeks: ChartBar[] = [{ label: "Wk 1", amount: 0 }, { label: "Wk 2", amount: 0 }, { label: "Wk 3", amount: 0 }, { label: "Wk 4", amount: 0 }];
    bookings.forEach((b) => {
      const d = new Date(b.scheduledDate || b.createdAt || now);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        const wk = Math.min(3, Math.floor((d.getDate() - 1) / 7));
        weeks[wk].amount += Number(b.providerAmount ?? b.price ?? 0);
      }
    });
    return weeks;
  } else {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const buckets: number[] = new Array(12).fill(0);
    bookings.forEach((b) => {
      const d = new Date(b.scheduledDate || b.createdAt || now);
      if (d.getFullYear() === now.getFullYear()) buckets[d.getMonth()] += Number(b.providerAmount ?? b.price ?? 0);
    });
    return months.map((label, i) => ({ label, amount: buckets[i] }));
  }
}

function EarningsBarChart({ bars }: { bars: ChartBar[] }) {
  const maxAmount = Math.max(...bars.map((b) => b.amount), 1);
  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.bars}>
        {bars.map((bar, i) => {
          const heightPct = bar.amount / maxAmount;
          return (
            <View key={i} style={chartStyles.barCol}>
              <Text style={chartStyles.barAmt}>{bar.amount > 0 ? (bar.amount >= 1000 ? `${(bar.amount / 1000).toFixed(1)}k` : `${bar.amount}`) : ""}</Text>
              <View style={chartStyles.barTrack}>
                <View style={[chartStyles.barFill, { height: `${Math.max(heightPct * 100, bar.amount > 0 ? 4 : 0)}%`, backgroundColor: bar.amount > 0 ? Colors.secondary : Colors.border }]} />
              </View>
              <Text style={chartStyles.barLabel}>{bar.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.border },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 },
  barCol: { flex: 1, alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" },
  barAmt: { fontSize: 8, color: Colors.textMuted, fontWeight: "600" },
  barTrack: { width: "100%", flex: 1, justifyContent: "flex-end", borderRadius: 5, overflow: "hidden", backgroundColor: Colors.surface, maxWidth: 28 },
  barFill: { width: "100%", borderRadius: 5, minHeight: 0 },
  barLabel: { fontSize: 8, color: Colors.textSecondary, fontWeight: "600", marginTop: 2 },
});

export default function ProviderEarningsScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [period, setPeriod] = useState("This Month");

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const completedBookings = allBookings.filter((b) => b.status === "completed");
  const pendingPayout = allBookings.filter((b) => b.status === "accepted" || b.status === "in_progress");

  const summary = useMemo(() => {
    const gross = completedBookings.reduce((sum, booking) => sum + Number(booking.price || 0), 0);
    const providerNet = completedBookings.reduce(
      (sum, booking: any) => sum + Number(booking.providerAmount ?? booking.price ?? 0),
      0
    );
    const commission = completedBookings.reduce(
      (sum, booking: any) => sum + Number(booking.commissionAmount || 0),
      0
    );
    const pendingGross = pendingPayout.reduce((sum, booking) => sum + Number(booking.price || 0), 0);

    return { gross, providerNet, commission, pendingGross };
  }, [completedBookings, pendingPayout]);

  const chartBars = useMemo(() => buildChartData(completedBookings, period), [completedBookings, period]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}> 
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Earnings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
        <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Net Earnings</Text>
          <Text style={styles.earningsAmount}>Rs. {summary.providerNet.toLocaleString()}</Text>
          <View style={styles.earningsRow}>
            <View style={styles.earningsStat}>
              <Text style={styles.earningsStatVal}>{completedBookings.length}</Text>
              <Text style={styles.earningsStatLbl}>Completed Jobs</Text>
            </View>
            <View style={styles.earningsDivider} />
            <View style={styles.earningsStat}>
              <Text style={[styles.earningsStatVal, { color: "#fbbf24" }]}>Rs. {summary.pendingGross.toLocaleString()}</Text>
              <Text style={styles.earningsStatLbl}>Active Jobs</Text>
            </View>
            <View style={styles.earningsDivider} />
            <View style={styles.earningsStat}>
              <Text style={[styles.earningsStatVal, { color: "#86efac" }]}>Rs. {summary.commission.toLocaleString()}</Text>
              <Text style={styles.earningsStatLbl}>Athoo Commission</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.infoCard, user?.isBlocked ? styles.warningCard : null]}>
          <View style={styles.infoRow}>
            <Icon name={user?.isBlocked ? "alert-triangle" : "info"} size={16} color={user?.isBlocked ? "#b45309" : Colors.primary} />
            <Text style={[styles.infoText, user?.isBlocked ? styles.warningText : null]}>
              Pending Athoo commission: <Text style={styles.bold}>Rs. {Number(user?.pendingCommission || 0).toLocaleString()}</Text>
            </Text>
          </View>
          <Text style={[styles.subInfoText, user?.isBlocked ? styles.warningText : null]}>
            Limit: Rs. {Number(user?.commissionLimit || 0).toLocaleString()} {user?.isBlocked ? "• New jobs are blocked until payment is cleared." : "• Keep your dues below the limit to continue receiving orders."}
          </Text>
          {user?.blockedReason ? <Text style={[styles.subInfoText, styles.warningText]}>{user.blockedReason}</Text> : null}
        </View>

        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <Pressable key={p} style={[styles.periodBtn, period === p && styles.periodBtnActive]} onPress={() => setPeriod(p)}>
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <View>
          <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Earnings Chart</Text>
          <EarningsBarChart bars={chartBars} />
        </View>

        <Text style={styles.sectionTitle}>Completed Jobs</Text>
        {completedBookings.map((tx: any) => (
          <View key={tx.id} style={styles.txCard}>
            <View style={styles.txIcon}>
              <Icon name="briefcase" size={18} color={Colors.secondary} />
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txService}>{tx.service}</Text>
              <Text style={styles.txCustomer}>Customer: {tx.customerName}</Text>
              <Text style={styles.txDate}>{tx.scheduledDate || "Recent"}</Text>
            </View>
            <View style={styles.txRight}>
              <Text style={styles.txAmount}>Rs. {Number(tx.providerAmount ?? tx.price ?? 0).toLocaleString()}</Text>
              <View style={styles.txBreakdown}><Text style={styles.txBreakdownText}>Gross Rs. {Number(tx.price || 0).toLocaleString()} • Athoo Rs. {Number(tx.commissionAmount || 0).toLocaleString()}</Text></View>
              <View style={styles.paidBadge}><Text style={styles.paidText}>COMPLETED</Text></View>
            </View>
          </View>
        ))}

        {completedBookings.length === 0 && (
          <View style={styles.empty}>
            <Icon name="dollar-sign" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Earnings Yet</Text>
            <Text style={styles.emptySubtitle}>Complete jobs to see your provider earnings and Athoo commission here.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 60 },
  earningsCard: { borderRadius: 22, padding: 22, gap: 16 },
  earningsLabel: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  earningsAmount: { fontSize: 40, fontWeight: "800", color: "#fff" },
  earningsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, padding: 12, alignItems: "center" },
  earningsStat: { flex: 1, alignItems: "center" },
  earningsStatVal: { fontSize: 16, fontWeight: "800", color: "#fff" },
  earningsStatLbl: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  earningsDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.2)" },
  infoCard: { backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.primary + "30", gap: 6 },
  warningCard: { backgroundColor: "#fef3c7", borderColor: "#f59e0b66" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { flex: 1, fontSize: 13, color: Colors.primary },
  subInfoText: { fontSize: 12, color: Colors.textSecondary },
  warningText: { color: "#92400e" },
  bold: { fontWeight: "700" },
  periodRow: { flexDirection: "row", gap: 8 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  periodBtnActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  periodText: { fontSize: 11, fontWeight: "600", color: Colors.textSecondary },
  periodTextActive: { color: "#fff" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  txCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: Colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border },
  txIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1, gap: 2 },
  txService: { fontSize: 14, fontWeight: "700", color: Colors.text },
  txCustomer: { fontSize: 12, color: Colors.textSecondary },
  txDate: { fontSize: 11, color: Colors.textMuted },
  txRight: { alignItems: "flex-end", gap: 3 },
  txAmount: { fontSize: 15, fontWeight: "800", color: "#22C55E" },
  txBreakdown: { backgroundColor: Colors.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  txBreakdownText: { fontSize: 9, color: Colors.textMuted },
  paidBadge: { backgroundColor: "#22C55E20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  paidText: { fontSize: 10, fontWeight: "700", color: "#22C55E" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
});

