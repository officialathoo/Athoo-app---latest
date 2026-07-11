import React from "react";
import { View } from "react-native";
import { AppCard, AppText } from "@/components/design";
import { useTheme } from "@/context/ThemeContext";

interface ProviderMetricCardProps {
  label: string;
  value: string | number;
  tone?: "primary" | "danger" | "warning" | "success";
  testID?: string;
}

export function ProviderMetricCard({ label, value, tone = "primary", testID }: ProviderMetricCardProps) {
  const { theme } = useTheme();
  const toneMap = {
    primary: { foreground: theme.colors.primary, background: theme.colors.infoSoft },
    danger: { foreground: theme.colors.danger, background: theme.colors.dangerSoft },
    warning: { foreground: theme.colors.warning, background: theme.colors.warningSoft },
    success: { foreground: theme.colors.success, background: theme.colors.successSoft },
  } as const;
  const selected = toneMap[tone];

  return (
    <AppCard
      testID={testID}
      elevated={false}
      padding="sm"
      style={{ flex: 1, minHeight: 74, backgroundColor: selected.background, borderColor: "transparent" }}
    >
      <View style={{ alignItems: "center", justifyContent: "center", flex: 1, gap: theme.spacing.xs }}>
        <AppText variant="h3" style={{ color: selected.foreground }}>{value}</AppText>
        <AppText variant="caption" tone="secondary" align="center">{label}</AppText>
      </View>
    </AppCard>
  );
}
