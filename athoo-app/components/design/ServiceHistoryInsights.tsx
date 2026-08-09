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

export function ServiceHistoryInsights({
  bookings,
  onBookAgain,
}: ServiceHistoryInsightsProps) {
  const { theme } = useTheme();
  const insights = useMemo(
    () => buildServiceHistoryInsights(bookings).slice(0, 2),
    [bookings],
  );

  if (insights.length === 0) return null;

  return (
    <View style={styles.wrapper} testID="service-history-insights">
      <View style={styles.headingRow}>
        <View style={[styles.headingIcon, { backgroundColor: theme.colors.infoSoft }]}>
          <Icon name="clock" size={16} color={theme.colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <AppText variant="bodyStrong">Service history</AppText>
          <AppText variant="caption" tone="muted">
            Useful timing based on completed services
          </AppText>
        </View>
      </View>

      {insights.map((insight) => (
        <AppCard
          key={`${insight.service}-${insight.latestBooking.id}`}
          padding="md"
          elevated={false}
          style={styles.card}
        >
          <View style={styles.row}>
            <View style={styles.copy}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {insight.service}
              </AppText>
              <AppText variant="caption" tone="muted">
                {insight.completedCount} completed {insight.completedCount === 1 ? "booking" : "bookings"}
              </AppText>
              <AppText
                variant="caption"
                tone={insight.daysUntilSuggested <= 30 ? "success" : "secondary"}
                style={styles.due}
              >
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
                {
                  backgroundColor: pressed ? theme.colors.primary : theme.colors.infoSoft,
                  borderColor: pressed ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              {({ pressed }) => (
                <>
                  <Icon
                    name="repeat"
                    size={14}
                    color={pressed ? theme.colors.white : theme.colors.primary}
                  />
                  <AppText
                    variant="label"
                    style={{ color: pressed ? theme.colors.white : theme.colors.primary }}
                  >
                    Book again
                  </AppText>
                </>
              )}
            </Pressable>
          </View>
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
    marginBottom: 12,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  headingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: {
    flex: 1,
    gap: 1,
  },
  card: {
    marginBottom: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  due: {
    marginTop: 2,
  },
  action: {
    minHeight: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
});