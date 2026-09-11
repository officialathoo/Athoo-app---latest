import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppCard } from "./AppCard";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

interface BookingTrustPanelProps {
  status: string;
  paymentStatus?: string | null;
  providerName?: string | null;
  onSupport?: () => void;
}

const COPY: Record<string, { title: string; body: string; icon: string }> = {
  pending: {
    title: "Request protected",
    body: "No work starts until a provider accepts your request.",
    icon: "shield",
  },
  accepted: {
    title: "Provider confirmed",
    body: "Share the start PIN only after the provider reaches your address.",
    icon: "key",
  },
  in_progress: {
    title: "Work in progress",
    body: "Keep the completion PIN private until the work is finished to your satisfaction.",
    icon: "tool",
  },
  completed: {
    title: "Service completed",
    body: "Review the invoice and contact support if anything needs attention.",
    icon: "check-circle",
  },
  cancelled: {
    title: "Booking cancelled",
    body: "This booking cannot continue. Support can help with any unresolved issue.",
    icon: "x-circle",
  },
};

export function BookingTrustPanel({
  status,
  paymentStatus,
  providerName,
  onSupport,
}: BookingTrustPanelProps) {
  const { theme } = useTheme();
  const copy = COPY[status] ?? COPY.pending;
  const payment = String(paymentStatus || "pending").replace(/_/g, " ");

  return (
    <AppCard
      padding="md"
      elevated={false}
      style={[styles.card, { backgroundColor: theme.colors.infoSoft }]}
      testID="customer-booking-trust-panel"
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.surface }]}>
          <Icon name={copy.icon as any} size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.copy}>
          <AppText variant="bodyStrong">{copy.title}</AppText>
          <AppText variant="caption" tone="secondary">
            {copy.body}
          </AppText>
        </View>
      </View>

      <View style={[styles.meta, { borderTopColor: theme.colors.border }]}>
        <View style={styles.metaItem}>
          <AppText variant="caption" tone="muted">Provider</AppText>
          <AppText variant="label" numberOfLines={1}>
            {providerName || "Not assigned yet"}
          </AppText>
        </View>

        <View style={styles.metaItem}>
          <AppText variant="caption" tone="muted">Payment</AppText>
          <AppText variant="label" style={{ textTransform: "capitalize" }}>
            {payment}
          </AppText>
        </View>
      </View>

      {onSupport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Contact Athoo support"
          onPress={onSupport}
          style={({ pressed }) => [
            styles.support,
            {
              backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          testID="customer-booking-support-action"
        >
          <Icon name="life-buoy" size={16} color={theme.colors.primary} />
          <AppText variant="label" style={{ color: theme.colors.primary }}>
            Need help?
          </AppText>
        </Pressable>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 11,
  },
  header: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  metaItem: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  support: {
    alignSelf: "flex-start",
    minHeight: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});