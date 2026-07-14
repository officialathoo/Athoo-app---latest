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
  pending: { title: "Request protected", body: "No work starts until a provider accepts your request.", icon: "shield" },
  accepted: { title: "Provider confirmed", body: "Share the start PIN only after the provider reaches your address.", icon: "key" },
  in_progress: { title: "Work in progress", body: "Keep the completion PIN private until the work is finished to your satisfaction.", icon: "tool" },
  completed: { title: "Service completed", body: "Review the invoice and contact support if anything needs attention.", icon: "check-circle" },
  cancelled: { title: "Booking cancelled", body: "This booking cannot continue. Support can help with any unresolved issue.", icon: "x-circle" },
};

export function BookingTrustPanel({ status, paymentStatus, providerName, onSupport }: BookingTrustPanelProps) {
  const { theme } = useTheme();
  const copy = COPY[status] ?? COPY.pending;
  const payment = String(paymentStatus || "pending").replace(/_/g, " ");

  return (
    <AppCard style={styles.card} testID="customer-booking-trust-panel">
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.infoSoft }]}>
          <Icon name={copy.icon as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.copy}>
          <AppText variant="h3">{copy.title}</AppText>
          <AppText variant="body" tone="secondary">{copy.body}</AppText>
        </View>
      </View>
      <View style={[styles.meta, { borderTopColor: theme.colors.border }]}> 
        <View style={styles.metaItem}>
          <AppText variant="caption" tone="secondary">Provider</AppText>
          <AppText variant="label">{providerName || "Not assigned yet"}</AppText>
        </View>
        <View style={styles.metaItem}>
          <AppText variant="caption" tone="secondary">Payment</AppText>
          <AppText variant="label" style={{ textTransform: "capitalize" }}>{payment}</AppText>
        </View>
      </View>
      {onSupport ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Contact Athoo support" onPress={onSupport} style={styles.support} testID="customer-booking-support-action">
          <Icon name="life-buoy" size={17} color={theme.colors.primary} />
          <AppText variant="label" style={{ color: theme.colors.primary }}>Need help with this booking?</AppText>
        </Pressable>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  meta: { flexDirection: "row", gap: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  metaItem: { flex: 1, gap: 2 },
  support: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
