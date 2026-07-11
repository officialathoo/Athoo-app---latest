import React from "react";
import { View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { AppCard } from "./AppCard";
import { Skeleton } from "./Skeleton";

export function CustomerHomeSkeleton() {
  const { theme } = useTheme();
  return (
    <View testID="customer-home-skeleton" accessibilityLabel="Loading home content" style={{ gap: theme.spacing.xl }}>
      <Skeleton height={138} radius={theme.radius.lg} />
      <View style={{ gap: theme.spacing.md }}>
        <Skeleton width={150} height={22} />
        <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
          {[0, 1, 2, 3].map((item) => (
            <AppCard key={item} padding="sm" elevated={false} style={{ width: 78, alignItems: "center", gap: theme.spacing.sm }}>
              <Skeleton width={44} height={44} radius={theme.radius.md} />
              <Skeleton width={52} height={12} />
            </AppCard>
          ))}
        </View>
      </View>
      <View style={{ gap: theme.spacing.md }}>
        <Skeleton width={180} height={22} />
        {[0, 1].map((item) => (
          <AppCard key={item} padding="md" elevated={false} style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <Skeleton width={64} height={64} radius={theme.radius.md} />
            <View style={{ flex: 1, gap: theme.spacing.sm }}>
              <Skeleton width="68%" height={16} />
              <Skeleton width="48%" height={12} />
              <Skeleton width="82%" height={12} />
            </View>
          </AppCard>
        ))}
      </View>
    </View>
  );
}
