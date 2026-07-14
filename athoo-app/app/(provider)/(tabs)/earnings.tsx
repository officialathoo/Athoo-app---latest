import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { BookingCard } from "@/components/ui/BookingCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings, Booking } from "@/context/BookingContext";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekStart(offset = 0): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${weekStart.toLocaleDateString("en-PK", opts)} – ${end.toLocaleDateString("en-PK", opts)}`;
}

function getEarningsByDay(bookings: Booking[], weekStart: Date): number[] {
  const result = [0, 0, 0, 0, 0, 0, 0];
  for (const b of bookings) {
    if (b.status !== "completed" || !b.price) continue;
    const d = new Date(b.updatedAt || b.createdAt || "");
    if (isNaN(d.getTime())) continue;
    const diffMs = d.getTime() - weekStart.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays >= 0 && diffDays <= 6) {
      result[diffDays] += b.price;
    }
  }
  return result;
}

function getJobsByDay(bookings: Booking[], weekStart: Date): number[] {
  const result = [0, 0, 0, 0, 0, 0, 0];
  for (const b of bookings) {
    if (b.status !== "completed") continue;
    const d = new Date(b.updatedAt || b.createdAt || "");
    if (isNaN(d.getTime())) continue;
    const diffMs = d.getTime() - weekStart.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays >= 0 && diffDays <= 6) {
      result[diffDays] += 1;
    }
  }
  return result;
}

function getTodayDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

interface BarChartProps {
  data: number[];
  color: string;
  max: number;
  isCurrentWeek: boolean;
}

function BarChart({ data, color, max, isCurrentWeek }: BarChartProps) {
  const { width: screenW } = useWindowDimensions();
  const barAreaW = screenW - 80;
  const todayIdx = getTodayDayIndex();
  const barW = Math.floor((barAreaW - 6 * 8) / 7);
  const maxH = 80;

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      {data.map((val, i) => {
        const h = max > 0 ? Math.round((val / max) * maxH) : 0;
        const isToday = isCurrentWeek && i === todayIdx;
        const isActive = val > 0;
        return (
          <View key={i} style={{ alignItems: "center", gap: 4, flex: 1 }}>
            <View
              style={{
                width: "100%",
                height: Math.max(h, 4),
                borderRadius: 6,
                backgroundColor: isToday ? color : isActive ? color + "80" : Colors.border,
              }}
            />
            <Text style={{ fontSize: 9, color: isToday ? color : Colors.textMuted, fontWeight: isToday ? "700" : "600" }}>
              {DAY_LABELS[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function EarningsScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [weekOffset, setWeekOffset] = useState(0);
  const [chartMode, setChartMode] = useState<"earnings" | "jobs">("earnings");

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const completed = allBookings.filter((b) => b.status === "completed");
  const totalEarnings = completed.reduce((s, b) => s + (b.price || 0), 0);
  const totalJobs = completed.length;
  const avgPerJob = totalJobs > 0 ? Math.round(totalEarnings / totalJobs) : 0;
  const avgRating = user?.rating ? (user.rating / 10).toFixed(1) : "–";

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);
  const isCurrentWeek = weekOffset === 0;

  const earningsByDay = useMemo(() => getEarningsByDay(allBookings, weekStart), [allBookings, weekStart]);
  const jobsByDay = useMemo(() => getJobsByDay(allBookings, weekStart), [allBookings, weekStart]);

  const weekEarnings = earningsByDay.reduce((a, b) => a + b, 0);
  const weekJobs = jobsByDay.reduce((a, b) => a + b, 0);

  const chartData = chartMode === "earnings" ? earningsByDay : jobsByDay;
  const chartMax = chartData.reduce((a, b) => Math.max(a, b), 1);
  const chartColor = chartMode === "earnings" ? "#22C55E" : Colors.secondary;

  const recentCompleted = [...completed]
    .sort((a, b) => {
      const da = new Date(a.updatedAt || a.createdAt || "").getTime();
      const db2 = new Date(b.updatedAt || b.createdAt || "").getTime();
      return db2 - da;
    })
    .slice(0, 10);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.headerGrad}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>My Earnings</Text>
        <View style={styles.headerStats}>
          <View style={styles.hStatItem}>
            <Text style={styles.hStatVal}>Rs. {totalEarnings.toLocaleString()}</Text>
            <Text style={styles.hStatLbl}>Total Earned</Text>
          </View>
          <View style={styles.hStatDiv} />
          <View style={styles.hStatItem}>
            <Text style={styles.hStatVal}>{totalJobs}</Text>
            <Text style={styles.hStatLbl}>Jobs Done</Text>
          </View>
          <View style={styles.hStatDiv} />
          <View style={styles.hStatItem}>
            <Text style={styles.hStatVal}>{avgRating}</Text>
            <Text style={styles.hStatLbl}>Avg Rating</Text>
          </View>
          <View style={styles.hStatDiv} />
          <View style={styles.hStatItem}>
            <Text style={styles.hStatVal}>Rs. {avgPerJob.toLocaleString()}</Text>
            <Text style={styles.hStatLbl}>Avg/Job</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>
        <AnimatedCard delay={60}>
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.weekNav}>
                <Pressable
                  style={styles.weekNavBtn}
                  onPress={() => setWeekOffset((w) => w - 1)}
                >
                  <Icon name="chevron-left" size={16} color={Colors.text} />
                </Pressable>
                <Text style={styles.weekLabel}>{weekLabel}</Text>
                <Pressable
                  style={[styles.weekNavBtn, isCurrentWeek && styles.weekNavBtnDisabled]}
                  onPress={() => !isCurrentWeek && setWeekOffset((w) => w + 1)}
                >
                  <Icon name="chevron-right" size={16} color={isCurrentWeek ? Colors.border : Colors.text} />
                </Pressable>
              </View>

              <View style={styles.chartToggle}>
                <Pressable
                  style={[styles.chartToggleBtn, chartMode === "earnings" && styles.chartToggleActive]}
                  onPress={() => setChartMode("earnings")}
                >
                  <Text style={[styles.chartToggleText, chartMode === "earnings" && styles.chartToggleTextActive]}>Rs.</Text>
                </Pressable>
                <Pressable
                  style={[styles.chartToggleBtn, chartMode === "jobs" && { backgroundColor: Colors.secondary + "20" }]}
                  onPress={() => setChartMode("jobs")}
                >
                  <Text style={[styles.chartToggleText, chartMode === "jobs" && { color: Colors.secondary }]}>Jobs</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.weekSummaryRow}>
              <View style={styles.weekSummaryItem}>
                <Text style={[styles.weekSummaryVal, { color: "#22C55E" }]}>
                  Rs. {weekEarnings.toLocaleString()}
                </Text>
                <Text style={styles.weekSummaryLbl}>This Week</Text>
              </View>
              <View style={styles.weekSummaryItem}>
                <Text style={[styles.weekSummaryVal, { color: Colors.secondary }]}>{weekJobs}</Text>
                <Text style={styles.weekSummaryLbl}>Jobs</Text>
              </View>
            </View>

            <View style={styles.barChart}>
              <BarChart
                data={chartData}
                color={chartColor}
                max={chartMax}
                isCurrentWeek={isCurrentWeek}
              />
            </View>

            {weekEarnings === 0 && (
              <View style={styles.noDataRow}>
                <Icon name="bar-chart-2" size={16} color={Colors.textMuted} />
                <Text style={styles.noDataText}>No completed jobs this week</Text>
              </View>
            )}
          </View>
        </AnimatedCard>

        {(user?.pendingCommission != null || user?.totalCommission != null) && (
          <AnimatedCard delay={90}>
            <View style={styles.commCard}>
              <View style={styles.commHeader}>
                <Icon name="percent" size={16} color="#8B5CF6" />
                <Text style={styles.commTitle}>Commission Overview</Text>
              </View>
              <View style={styles.commRow}>
                <View style={styles.commItem}>
                  <Text style={styles.commVal}>Rs. {(user?.totalCommission || 0).toLocaleString()}</Text>
                  <Text style={styles.commLbl}>Total Deducted</Text>
                </View>
                <View style={styles.commDivider} />
                <View style={styles.commItem}>
                  <Text style={[styles.commVal, { color: Colors.error }]}>Rs. {(user?.pendingCommission || 0).toLocaleString()}</Text>
                  <Text style={styles.commLbl}>Pending Due</Text>
                </View>
                {user?.commissionLimit != null && (
                  <>
                    <View style={styles.commDivider} />
                    <View style={styles.commItem}>
                      <Text style={styles.commVal}>Rs. {(user.commissionLimit).toLocaleString()}</Text>
                      <Text style={styles.commLbl}>Monthly Limit</Text>
                    </View>
                  </>
                )}
              </View>
              <Text style={styles.commNote}>Commission is 10% per booking, deducted from your earnings on completion.</Text>
            </View>
          </AnimatedCard>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Completed Jobs</Text>
          <Text style={styles.sectionCount}>{completed.length} total</Text>
        </View>

        {recentCompleted.length === 0 ? (
          <AnimatedCard delay={120}>
            <View style={styles.empty}>
              <Icon name="briefcase" size={36} color={Colors.border} />
              <Text style={styles.emptyTitle}>No completed jobs yet</Text>
              <Text style={styles.emptySubtitle}>Earnings will appear here once you complete bookings</Text>
            </View>
          </AnimatedCard>
        ) : (
          recentCompleted.map((b, i) => (
            <AnimatedCard key={b.id} delay={80 + i * 40}>
              <View style={styles.jobRow}>
                <BookingCard
                  booking={b}
                  role="provider"
                  onPress={() =>
                    router.push({
                      pathname: "/(provider)/job-detail",
                      params: { bookingId: b.id },
                    })
                  }
                />
                {b.price ? (
                  <View style={styles.earningBadge}>
                    <Text style={styles.earningBadgeText}>+Rs. {b.price.toLocaleString()}</Text>
                  </View>
                ) : null}
              </View>
            </AnimatedCard>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerGrad: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 16 },
  headerStats: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  hStatItem: { flex: 1, alignItems: "center", gap: 2 },
  hStatVal: { fontSize: 14, fontWeight: "800", color: "#fff" },
  hStatLbl: { fontSize: 9, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  hStatDiv: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  chartCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
    gap: 14,
  },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  weekNav: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekNavBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  weekNavBtnDisabled: { opacity: 0.3 },
  weekLabel: { fontSize: 12, fontWeight: "700", color: Colors.text, maxWidth: 120 },
  chartToggle: { flexDirection: "row", gap: 4 },
  chartToggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  chartToggleActive: { backgroundColor: "#22C55E20" },
  chartToggleText: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  chartToggleTextActive: { color: "#22C55E" },
  weekSummaryRow: { flexDirection: "row", gap: 20 },
  weekSummaryItem: { gap: 2 },
  weekSummaryVal: { fontSize: 20, fontWeight: "800" },
  weekSummaryLbl: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600" },
  barChart: { paddingTop: 4 },
  noDataRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    justifyContent: "center", paddingVertical: 8,
  },
  noDataText: { fontSize: 12, color: Colors.textMuted },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  sectionCount: { fontSize: 12, color: Colors.textSecondary },
  jobRow: { position: "relative" },
  earningBadge: {
    position: "absolute",
    bottom: 14,
    right: 14,
    backgroundColor: "#22C55E15",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  earningBadgeText: { fontSize: 11, fontWeight: "800", color: "#22C55E" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },
  commCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
    gap: 12,
  },
  commHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  commTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  commRow: { flexDirection: "row", alignItems: "center" },
  commItem: { flex: 1, alignItems: "center", gap: 3 },
  commDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  commVal: { fontSize: 15, fontWeight: "800", color: Colors.text },
  commLbl: { fontSize: 10, color: Colors.textSecondary, fontWeight: "600", textAlign: "center" },
  commNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
});

