import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BillingFilter = "all" | "completed" | "pending";

const FILTER_OPTIONS: BillingFilter[] = ["all", "completed", "pending"];

export default function BillingScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const { theme } = useTheme();
  const { isUrdu, formatCurrency, formatDate, translate: tr } = useLang();
  const styles = useMemo(() => createStyles(theme, isUrdu), [theme, isUrdu]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [filter, setFilter] = useState<BillingFilter>("all");

  const all = user ? getMyBookings(user.id, "customer") : [];
  const filtered = all.filter((booking) => {
    if (filter === "completed") return booking.status === "completed";
    if (filter === "pending") return booking.status === "pending" || booking.status === "accepted";
    return true;
  });

  const totalSpent = all
    .filter((booking) => booking.status === "completed")
    .reduce((sum, booking) => sum + Number(booking.price || 0), 0);
  const completedCount = all.filter((booking) => booking.status === "completed").length;
  const activeCount = all.filter((booking) => ["pending", "accepted", "in_progress"].includes(booking.status)).length;

  const getStatusTone = (status: string) => {
    if (status === "completed") return { color: theme.colors.success, bg: theme.colors.successSoft, label: tr("Completed") };
    if (status === "pending") return { color: theme.colors.warning, bg: theme.colors.warningSoft, label: tr("Pending") };
    if (status === "accepted" || status === "in_progress") return { color: theme.colors.info, bg: theme.colors.infoSoft, label: tr("Active") };
    if (status === "cancelled") return { color: theme.colors.danger, bg: theme.colors.dangerSoft, label: tr("Cancelled") };
    return { color: theme.colors.textSecondary, bg: theme.colors.surfaceAlt, label: status };
  };

  const filterLabel = (value: BillingFilter) => {
    if (value === "all") return tr("All");
    if (value === "completed") return tr("Completed");
    return tr("Pending");
  };

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
        <Text accessibilityRole="header" style={styles.title}>{tr("Billing & History")}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <AnimatedCard delay={80}>
          <View style={styles.summaryRow} accessibilityRole="summary">
            <View style={[styles.summaryCard, { backgroundColor: theme.colors.primary }]}>
              <Icon name="dollar-sign" size={20} color={theme.colors.white} />
              <Text style={styles.summaryVal}>{formatCurrency(totalSpent)}</Text>
              <Text style={styles.summaryLabel}>{tr("Total Spent")}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.colors.success }]}>
              <Icon name="check-circle" size={20} color={theme.colors.white} />
              <Text style={styles.summaryVal}>{completedCount}</Text>
              <Text style={styles.summaryLabel}>{tr("Completed Jobs")}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.colors.secondary }]}>
              <Icon name="activity" size={20} color={theme.colors.white} />
              <Text style={styles.summaryVal}>{activeCount}</Text>
              <Text style={styles.summaryLabel}>{tr("Active")}</Text>
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard delay={150}>
          <View style={styles.filterRow} accessibilityRole="tablist">
            {FILTER_OPTIONS.map((option) => {
              const selected = filter === option;
              const label = filterLabel(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => setFilter(option)}
                  style={({ pressed }) => [styles.filterChip, selected && styles.filterActive, pressed && styles.pressed]}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </AnimatedCard>

        {filtered.length === 0 ? (
          <AnimatedCard delay={200}>
            <View style={styles.empty} accessibilityRole="text">
              <Icon name="file-text" size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>{tr("No transactions")}</Text>
              <Text style={styles.emptyText}>{tr("Your billing history will appear here")}</Text>
            </View>
          </AnimatedCard>
        ) : (
          filtered.map((booking, index) => {
            const status = getStatusTone(booking.status);
            const amountText = booking.price ? formatCurrency(booking.price) : tr("TBD");
            return (
              <AnimatedCard key={booking.id} delay={200 + index * 50}>
                <Pressable
                  style={({ pressed }) => [styles.txCard, pressed && styles.pressed]}
                  onPress={() => router.push({
                    pathname: "/(customer)/booking-detail",
                    params: { bookingId: booking.id },
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`${booking.service}, ${booking.providerName}, ${amountText}, ${status.label}`}
                  accessibilityHint={tr("Opens booking details")}
                >
                  <View style={[styles.txIcon, { backgroundColor: status.bg }]}>
                    <Icon name={booking.serviceIcon as any} size={20} color={status.color} />
                  </View>
                  <View style={styles.txContent}>
                    <Text style={styles.txService}>{booking.service}</Text>
                    <Text style={styles.txProvider}>{booking.providerName}</Text>
                    <Text style={styles.txDate}>{formatDate(booking.createdAt)}</Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={booking.price ? styles.txAmount : styles.txAmountPending}>{amountText}</Text>
                    <View style={[styles.txStatus, { backgroundColor: status.bg }]}>
                      <Text style={[styles.txStatusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>
                </Pressable>
              </AnimatedCard>
            );
          })
        )}

        <AnimatedCard delay={320}>
          <View style={styles.securityNote} accessibilityRole="text">
            <Icon name="lock" size={14} color={theme.colors.primary} />
            <Text style={styles.securityText}>
              {tr("Payments are made directly to the provider in cash. Athoo never handles your money or stores payment details.")}
            </Text>
          </View>
        </AnimatedCard>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AthooTheme, isUrdu: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
    title: { flex: 1, fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    scroll: { padding: 20, gap: 14, paddingBottom: 60 },
    summaryRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 10, marginBottom: 4 },
    summaryCard: { flex: 1, minHeight: 104, borderRadius: 16, padding: 12, alignItems: "center", justifyContent: "center", gap: 6 },
    summaryVal: { fontSize: 15, fontWeight: "800", color: theme.colors.white, textAlign: "center" },
    summaryLabel: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.86)", textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    filterRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 8 },
    filterChip: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
    filterActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterText: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary, writingDirection: isUrdu ? "rtl" : "ltr" },
    filterTextActive: { color: theme.colors.white },
    txCard: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.sm },
    pressed: { opacity: 0.84 },
    txIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    txContent: { flex: 1, gap: 2 },
    txService: { fontSize: 14, fontWeight: "700", color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txProvider: { fontSize: 12, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txRight: { alignItems: isUrdu ? "flex-start" : "flex-end", gap: 4 },
    txAmount: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
    txAmountPending: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
    txStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
    txStatusText: { fontSize: 10, fontWeight: "700", writingDirection: isUrdu ? "rtl" : "ltr" },
    empty: { alignItems: "center", paddingVertical: 56, gap: 10, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18 },
    emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    emptyText: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    securityNote: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 8, alignItems: "flex-start", backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.focusRing, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
    securityText: { flex: 1, fontSize: 11, color: theme.colors.textSecondary, lineHeight: 17, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
  });
}
