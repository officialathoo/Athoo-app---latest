import React from "react";
import { View } from "react-native";
import { AppCard } from "@/components/design/AppCard";
import { Skeleton } from "@/components/design/Skeleton";
import { useTheme } from "@/context/ThemeContext";

export function ProviderJobsSkeleton() {
  const { theme } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading provider jobs" style={{ gap: theme.spacing.md }}>
      {[0, 1, 2].map((item) => (
        <AppCard key={item} padding="md" elevated={false}>
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
              <Skeleton width={44} height={44} radius={14} />
              <View style={{ flex: 1, gap: theme.spacing.sm }}>
                <Skeleton width="62%" height={14} />
                <Skeleton width="42%" height={11} />
              </View>
              <Skeleton width={68} height={24} radius={12} />
            </View>
            <Skeleton width="100%" height={10} />
            <Skeleton width="76%" height={10} />
          </View>
        </AppCard>
      ))}
    </View>
  );
}
