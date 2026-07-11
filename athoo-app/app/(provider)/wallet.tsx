import { Icon } from "@/components/ui/Icon";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { api } from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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

function currency(n: number) {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [bRes] = await Promise.all([
        api.getBookings(),
        refreshUser().catch(() => {}),
      ]);
      setBookings((bRes?.bookings || []) as Booking[]);
    } catch {
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

  const completed = bookings.filter(b => b.status === "completed");
  const totalEarned = completed.reduce((s, b) => s + (b.providerAmount || 0), 0);
  const totalCommissionPaid = Math.max(0, (user?.totalCommission || 0) - (user?.pendingCommission || 0));
  const pendingDues = user?.pendingCommission || 0;
  const commissionLimit = platformSettings.defaultCommissionLimit || user?.commissionLimit || 5000;
  const duesProgress = Math.min(1, pendingDues / commissionLimit);
  const recent = [...completed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8F9FA" }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F8F9FA" }}>
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>My Wallet</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero balance */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Total Job Earnings</Text>
          <Text style={styles.heroValue}>{currency(totalEarned)}</Text>
          <Text style={styles.heroSub}>{completed.length} completed job{completed.length !== 1 ? "s" : ""}</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{currency(totalCommissionPaid)}</Text>
              <Text style={styles.heroStatLabel}>Paid to Athoo</Text>
            </View>
            <View style={styles.heroStatDiv} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatVal, pendingDues > 0 && { color: "#FDE68A" }]}>{currency(pendingDues)}</Text>
              <Text style={styles.heroStatLabel}>Pending Dues</Text>
            </View>
            <View style={styles.heroStatDiv} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{currency(commissionLimit - pendingDues)}</Text>
              <Text style={styles.heroStatLabel}>Dues Remaining</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Commission dues progress */}
        {pendingDues > 0 && (
          <View style={styles.duesCard}>
            <View style={styles.duesTop}>
              <View style={styles.duesIcon}>
                <Icon name="alert-triangle" size={16} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.duesTitle}>Commission Dues Outstanding</Text>
                <Text style={styles.duesSub}>Pay to Athoo to keep your account active</Text>
              </View>
              <Text style={styles.duesAmt}>{currency(pendingDues)}</Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${Math.round(duesProgress * 100)}%`, backgroundColor: duesProgress > 0.8 ? Colors.error : "#F59E0B" }]} />
            </View>
            <Text style={styles.duesLimit}>Limit: {currency(commissionLimit)} · {Math.round(duesProgress * 100)}% used</Text>
            <Pressable
              style={styles.payDuesBtn}
              onPress={() => router.push("/(provider)/pay-commission" as any)}
            >
              <Icon name="credit-card" size={15} color="#fff" />
              <Text style={styles.payDuesBtnText}>Pay Commission Dues</Text>
            </Pressable>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push("/(provider)/earnings" as any)}
          >
            <LinearGradient colors={["#059669", "#10B981"]} style={styles.actionGrad}>
              <Icon name="trending-up" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.actionLabel}>Earnings{"\n"}History</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push("/(provider)/invoices" as any)}
          >
            <LinearGradient colors={["#7C3AED", "#8B5CF6"]} style={styles.actionGrad}>
              <Icon name="file-text" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.actionLabel}>View{"\n"}Invoices</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push("/(provider)/contact-support" as any)}
          >
            <LinearGradient colors={["#D97706", "#F59E0B"]} style={styles.actionGrad}>
              <Icon name="headphones" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.actionLabel}>Finance{"\n"}Support</Text>
          </Pressable>
        </View>

        {/* Quick stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Icon name="briefcase" size={18} color={Colors.primary} />
            <Text style={styles.statVal}>{completed.length}</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="dollar-sign" size={18} color="#059669" />
            <Text style={[styles.statVal, { color: "#059669" }]}>{currency(totalEarned)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Icon name="percent" size={18} color="#D97706" />
            <Text style={[styles.statVal, { color: "#D97706" }]}>{currency(user?.totalCommission || 0)}</Text>
            <Text style={styles.statLabel}>Commission Total</Text>
          </View>
        </View>

        {/* Recent transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Earnings</Text>
          {recent.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="inbox" size={32} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Complete jobs to see your earnings here</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {recent.map((b) => (
                <View key={b.id} style={styles.txRow}>
                  <View style={styles.txIcon}>
                    <Icon name="check-circle" size={16} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle} numberOfLines={1}>{b.service} · {b.customerName}</Text>
                    <Text style={styles.txDate}>{formatDate(b.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.txAmt}>+{currency(b.providerAmount || 0)}</Text>
                    {b.commissionAmount != null && b.commissionAmount > 0 && (
                      <Text style={styles.txComm}>-{currency(b.commissionAmount)} comm.</Text>
                    )}
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

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff", flex: 1, textAlign: "center" },
  heroCard: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  heroLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { fontSize: 36, fontWeight: "800", color: "#fff", marginTop: 4, marginBottom: 2 },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 16 },
  heroStats: { flexDirection: "row", alignItems: "center" },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { fontSize: 15, fontWeight: "700", color: "#fff", marginBottom: 2 },
  heroStatLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: "500" },
  heroStatDiv: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.3)" },
  duesCard: { backgroundColor: "#FFFBEB", borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#FDE68A" },
  duesTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  duesIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#FEF3C7", justifyContent: "center", alignItems: "center" },
  duesTitle: { fontSize: 14, fontWeight: "700", color: "#92400E" },
  duesSub: { fontSize: 12, color: "#B45309", marginTop: 1 },
  duesAmt: { fontSize: 15, fontWeight: "800", color: "#B45309" },
  progressBg: { height: 8, backgroundColor: "#FDE68A", borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", borderRadius: 4 },
  duesLimit: { fontSize: 11, color: "#92400E", marginBottom: 10 },
  payDuesBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#D97706", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  payDuesBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionBtn: { flex: 1, alignItems: "center", gap: 8 },
  actionGrad: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  actionLabel: { fontSize: 11, fontWeight: "600", color: Colors.text, textAlign: "center", lineHeight: 15 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  statVal: { fontSize: 13, fontWeight: "800", color: Colors.primary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: "center", fontWeight: "500" },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.text, marginBottom: 12 },
  empty: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  txList: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#E5E7EB" },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  txIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#D1FAE5", justifyContent: "center", alignItems: "center" },
  txTitle: { fontSize: 13, fontWeight: "600", color: Colors.text, marginBottom: 2 },
  txDate: { fontSize: 11, color: Colors.textSecondary },
  txAmt: { fontSize: 14, fontWeight: "700", color: "#059669", marginBottom: 1 },
  txComm: { fontSize: 11, color: Colors.textSecondary },
});
