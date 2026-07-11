import React from "react";
import { StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppText } from "./AppText";
import { useTheme } from "@/context/ThemeContext";

export type BookingProgressStep = {
  key: string;
  label: string;
  icon: string;
};

interface BookingProgressProps {
  steps: BookingProgressStep[];
  activeIndex: number;
  compact?: boolean;
  testID?: string;
}

export function BookingProgress({ steps, activeIndex, compact = false, testID = "booking-progress" }: BookingProgressProps) {
  const { theme } = useTheme();

  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: steps.length, now: activeIndex + 1 }}>
      <View style={styles.trackRow}>
        {steps.map((step, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          const color = complete || active ? theme.colors.primary : theme.colors.textMuted;
          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepWrap}>
                <View
                  style={[
                    styles.circle,
                    { borderColor: color, backgroundColor: complete || active ? theme.colors.infoSoft : theme.colors.surfaceAlt },
                    active && { borderWidth: 2 },
                  ]}
                >
                  <Icon name={(complete ? "check" : step.icon) as any} size={compact ? 12 : 14} color={color} />
                </View>
                {!compact && (
                  <AppText variant="caption" tone={active ? "primary" : "muted"} align="center" style={styles.label} numberOfLines={1}>
                    {step.label}
                  </AppText>
                )}
              </View>
              {index < steps.length - 1 && (
                <View style={[styles.line, { backgroundColor: index < activeIndex ? theme.colors.primary : theme.colors.border }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trackRow: { flexDirection: "row", alignItems: "flex-start" },
  stepWrap: { width: 56, alignItems: "center" },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  line: { flex: 1, height: 2, marginTop: 13, minWidth: 8 },
  label: { marginTop: 5, fontSize: 10 },
});
