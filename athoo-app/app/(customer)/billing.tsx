import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
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
    header: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, paddingHorizontal: redesign.layout.horizontalPadding, paddingTop: 14, paddingBottom: 14, backgroundColor: theme.colors.surface, borderBottomWidth: redesign.visual.cardBorderWidth, borderBottomColor: theme.colors.border, ...theme.shadows.sm },
    backBtn: { width: redesign.control.iconButtonSize, height: redesign.control.iconButtonSize, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border },
    title: { flex: 1, ...theme.typography.h2, color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr", letterSpacing: -0.25 },
    scroll: { padding: redesign.layout.horizontalPadding, gap: 14, paddingBottom: 60 },
    summaryRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 10, marginBottom: 4 },
    summaryCard: { flex: 1, minHeight: 108, borderRadius: theme.radius.lg, padding: 12, alignItems: "center", justifyContent: "center", gap: 6, ...theme.shadows.sm },
    summaryVal: { ...theme.typography.h3, color: theme.colors.white, textAlign: "center" },
    summaryLabel: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: "rgba(255,255,255,0.86)", textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    filterRow: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 8 },
    filterChip: { flex: 1, minHeight: redesign.control.compactHeight, paddingHorizontal: 12, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface, borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
    filterActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary, writingDirection: isUrdu ? "rtl" : "ltr" },
    filterTextActive: { color: theme.colors.white },
    txCard: { flexDirection: isUrdu ? "row-reverse" : "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 14, borderWidth: redesign.visual.cardBorderWidth, borderColor: theme.colors.border, ...theme.shadows.sm },
    pressed: { opacity: 0.88, transform: [{ scale: redesign.visual.pressedScale }] },
    txIcon: { width: 46, height: 46, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center" },
    txContent: { flex: 1, gap: 2 },
    txService: { ...theme.typography.label, color: theme.colors.text, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txProvider: { ...theme.typography.caption, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txDate: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 1, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
    txRight: { alignItems: isUrdu ? "flex-start" : "flex-end", gap: 4 },
    txAmount: { ...theme.typography.h3, color: theme.colors.text },
    txAmountPending: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textMuted },
    txStatus: { paddingHorizontal: 8, minHeight: 24, justifyContent: "center", borderRadius: theme.radius.pill },
    txStatusText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, writingDirection: isUrdu ? "rtl" : "ltr" },
    empty: { alignItems: "center", paddingVertical: 56, gap: 10, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: redesign.visual.cardBorderWidth, borderRadius: theme.radius.xl, ...theme.shadows.sm },
    emptyTitle: { ...theme.typography.h3, color: theme.colors.text, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    emptyText: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center", writingDirection: isUrdu ? "rtl" : "ltr" },
    securityNote: { flexDirection: isUrdu ? "row-reverse" : "row", gap: 8, alignItems: "flex-start", backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.focusRing, borderWidth: redesign.visual.cardBorderWidth, borderRadius: theme.radius.md, padding: 12, marginTop: 4 },
    securityText: { flex: 1, ...theme.typography.caption, color: theme.colors.textSecondary, textAlign: isUrdu ? "right" : "left", writingDirection: isUrdu ? "rtl" : "ltr" },
  });
}
