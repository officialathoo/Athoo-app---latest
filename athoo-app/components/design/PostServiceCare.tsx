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

export function PostServiceCare({
  rated,
  paymentConfirmed,
  onInvoice,
  onSupport,
  onBookAgain,
}: PostServiceCareProps) {
  const { theme } = useTheme();

  const actions = [
    { key: "invoice", label: "Invoice", icon: "file-text", onPress: onInvoice },
    ...(onBookAgain
      ? [{ key: "repeat", label: "Book again", icon: "repeat", onPress: onBookAgain }]
      : []),
    { key: "support", label: "Support", icon: "life-buoy", onPress: onSupport },
  ];

  return (
    <AppCard padding="md" elevated={false} style={styles.card} testID="customer-post-service-care">
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.successSoft }]}>
          <Icon name="heart" size={18} color={theme.colors.success} />
        </View>
        <View style={styles.copy}>
          <AppText variant="bodyStrong">After-service care</AppText>
          <AppText variant="caption" tone="secondary">
            Keep your receipt, share feedback and contact Athoo if you need follow-up.
          </AppText>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusPill, { backgroundColor: rated ? theme.colors.successSoft : theme.colors.neutralSoft }]}>
          <Icon name={rated ? "check-circle" : "clock"} size={12} color={rated ? theme.colors.success : theme.colors.textMuted} />
          <AppText variant="caption" tone={rated ? "success" : "secondary"}>
            {rated ? "Reviewed" : "Review pending"}
          </AppText>
        </View>

        <View style={[styles.statusPill, { backgroundColor: paymentConfirmed ? theme.colors.successSoft : theme.colors.neutralSoft }]}>
          <Icon name={paymentConfirmed ? "check-circle" : "clock"} size={12} color={paymentConfirmed ? theme.colors.success : theme.colors.textMuted} />
          <AppText variant="caption" tone={paymentConfirmed ? "success" : "secondary"}>
            {paymentConfirmed ? "Payment confirmed" : "Payment pending"}
          </AppText>
        </View>
      </View>

      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            testID={`post-service-${action.key}`}
            style={({ pressed }) => [
              styles.action,
              {
                borderColor: theme.colors.border,
                backgroundColor: pressed ? theme.colors.infoSoft : theme.colors.surface,
              },
            ]}
          >
            <Icon name={action.icon as any} size={16} color={theme.colors.primary} />
            <AppText variant="label" style={{ color: theme.colors.primary }}>
              {action.label}
            </AppText>
          </Pressable>
        ))}
      </View>
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
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  statusPill: {
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  action: {
    minHeight: 40,
    flexGrow: 1,
    flexBasis: 94,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});