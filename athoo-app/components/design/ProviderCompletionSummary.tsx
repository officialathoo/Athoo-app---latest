import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppCard } from "./AppCard";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

export function ProviderCompletionSummary({ amount, paymentStatus, rating }: { amount: number; paymentStatus?: string | null; rating?: number | null }) {
  const { theme } = useTheme();
  return (
    <AppCard style={styles.card} testID="provider-completion-summary">
      <View style={styles.header}>
        <Icon name="award" size={21} color={theme.colors.success} />
        <AppText variant="h3">Job outcome</AppText>
      </View>
      <View style={styles.metrics}>
        <View style={styles.metric}><AppText variant="caption" tone="secondary">Agreed amount</AppText><AppText variant="h3">Rs. {Number(amount || 0).toLocaleString()}</AppText></View>
        <View style={styles.metric}><AppText variant="caption" tone="secondary">Payment</AppText><AppText variant="label" style={{ textTransform: "capitalize" }}>{String(paymentStatus || "pending").replace(/_/g, " ")}</AppText></View>
        <View style={styles.metric}><AppText variant="caption" tone="secondary">Customer rating</AppText><AppText variant="label">{rating ? `${rating}/5` : "Awaiting review"}</AppText></View>
      </View>
      <AppText variant="caption" tone="secondary">Keep all job communication inside Athoo so support can help fairly if a dispute is raised.</AppText>
    </AppCard>
  );
}
const styles = StyleSheet.create({ card: { gap: 12 }, header: { flexDirection: "row", alignItems: "center", gap: 8 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, metric: { flex: 1, minWidth: 95, gap: 3 } });
