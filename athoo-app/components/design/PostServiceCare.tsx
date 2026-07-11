import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppCard } from "./AppCard";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

interface PostServiceCareProps {
  rated: boolean;
  paymentConfirmed: boolean;
  onInvoice: () => void;
  onSupport: () => void;
  onBookAgain?: () => void;
}

export function PostServiceCare({ rated, paymentConfirmed, onInvoice, onSupport, onBookAgain }: PostServiceCareProps) {
  const { theme } = useTheme();
  const actions = [
    { key: "invoice", label: "View invoice", icon: "file-text", onPress: onInvoice },
    ...(onBookAgain ? [{ key: "repeat", label: "Book again", icon: "repeat", onPress: onBookAgain }] : []),
    { key: "support", label: "Get support", icon: "life-buoy", onPress: onSupport },
  ];
  return (
    <AppCard style={styles.card} testID="customer-post-service-care">
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.successSoft }]}>
          <Icon name="heart" size={20} color={theme.colors.success} />
        </View>
        <View style={styles.copy}>
          <AppText variant="h3">After-service care</AppText>
          <AppText variant="body" tone="secondary">Keep your receipt, share honest feedback, and contact Athoo if anything needs follow-up.</AppText>
        </View>
      </View>
      <View style={styles.statusRow}>
        <AppText variant="caption" tone={rated ? "success" : "secondary"}>{rated ? "Review submitted" : "Review pending"}</AppText>
        <AppText variant="caption" tone={paymentConfirmed ? "success" : "secondary"}>{paymentConfirmed ? "Payment confirmed" : "Payment confirmation pending"}</AppText>
      </View>
      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable key={action.key} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} testID={`post-service-${action.key}`} style={({ pressed }) => [styles.action, { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface }]}>
            <Icon name={action.icon as any} size={18} color={theme.colors.primary} />
            <AppText variant="label" style={{ color: theme.colors.primary }}>{action.label}</AppText>
          </Pressable>
        ))}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 44, flexGrow: 1, flexBasis: 110, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
});
