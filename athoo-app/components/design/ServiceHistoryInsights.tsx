import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import type { Booking } from "@/context/BookingContext";
import { buildServiceHistoryInsights } from "@/utils/serviceHistory";
import { useTheme } from "@/context/ThemeContext";
import { AppCard } from "./AppCard";
import { AppText } from "./AppText";

interface ServiceHistoryInsightsProps {
  bookings: Booking[];
  onBookAgain: (booking: Booking) => void;
}

function dueLabel(days: number): string {
  if (days < 0) return "Recommended now";
  if (days === 0) return "Recommended today";
  if (days <= 30) return `Recommended in ${days} days`;
  const months = Math.max(1, Math.round(days / 30));
  return `Recommended in about ${months} months`;
}

export function ServiceHistoryInsights({ bookings, onBookAgain }: ServiceHistoryInsightsProps) {
  const { theme } = useTheme();
  const insights = useMemo(() => buildServiceHistoryInsights(bookings).slice(0, 2), [bookings]);
  if (insights.length === 0) return null;

  return (
    <View style={styles.wrapper} testID="service-history-insights">
      <View style={styles.headingRow}>
        <View style={[styles.headingIcon, { backgroundColor: theme.colors.infoSoft }]}>
          <Icon name="clock" size={17} color={theme.colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <AppText variant="h3">Service history</AppText>
          <AppText variant="caption" tone="muted">Helpful timing based on your completed services</AppText>
        </View>
      </View>

      {insights.map((insight) => (
        <AppCard key={`${insight.service}-${insight.latestBooking.id}`} padding="md" elevated={false} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <AppText variant="bodyStrong">{insight.service}</AppText>
              <AppText variant="caption" tone="muted">
                {insight.completedCount} completed {insight.completedCount === 1 ? "booking" : "bookings"}
              </AppText>
              <AppText variant="label" tone={insight.daysUntilSuggested <= 30 ? "success" : "secondary"} style={styles.due}>
                {dueLabel(insight.daysUntilSuggested)}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Book ${insight.service} again`}
              testID={`service-history-rebook-${insight.latestBooking.id}`}
              onPress={() => onBookAgain(insight.latestBooking)}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.border },
                pressed && { opacity: 0.78 },
              ]}
            >
              <Icon name="repeat" size={15} color={theme.colors.primary} />
              <AppText variant="label" style={{ color: theme.colors.primary }}>Book again</AppText>
            </Pressable>
          </View>
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 10, marginBottom: 14 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1, gap: 1 },
  card: { marginBottom: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, gap: 3 },
  due: { marginTop: 3 },
  action: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6 },
});
