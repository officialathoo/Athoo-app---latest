import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppCard } from "./AppCard";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

export function ProviderJobChecklist({ status }: { status: string }) {
  const { theme } = useTheme();
  const steps = [
    { key: "accepted", label: "Reach the customer and confirm the job details" },
    { key: "in_progress", label: "Ask for the start PIN before beginning work" },
    { key: "completed", label: "Finish the work and verify the completion PIN" },
  ];
  const order = ["pending", "accepted", "in_progress", "completed"];
  const current = order.indexOf(status);
  return (
    <AppCard style={styles.card} testID="provider-job-checklist">
      <AppText variant="h3">Safe job checklist</AppText>
      {steps.map((step) => {
        const done = current >= order.indexOf(step.key);
        return <View key={step.key} style={styles.row}>
          <Icon name={done ? "check-circle" : "circle"} size={18} color={done ? theme.colors.success : theme.colors.textMuted} />
          <AppText variant="body" tone={done ? "primary" : "secondary"} style={styles.text}>{step.label}</AppText>
        </View>;
      })}
    </AppCard>
  );
}
const styles = StyleSheet.create({ card: { gap: 12 }, row: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, text: { flex: 1 } });
