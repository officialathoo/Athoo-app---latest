import React from "react";
import { View } from "react-native";
import { AppCard } from "./AppCard";
import { Skeleton } from "./Skeleton";
import { useTheme } from "@/context/ThemeContext";

export function CustomerHomeSkeleton() {
  const { theme } = useTheme();

  return (
    <View
      testID="customer-home-skeleton"
      accessibilityLabel="Loading home content"
      style={{ gap: theme.spacing.xl }}
    >
      <Skeleton height={120} radius={theme.radius.md} />

      <View style={{ gap: theme.spacing.md }}>
        <Skeleton width={132} height={20} />
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {[0, 1, 2, 3].map((item) => (
            <AppCard
              key={item}
              padding="sm"
              elevated={false}
              style={{
                width: 70,
                minHeight: 86,
                alignItems: "center",
                justifyContent: "center",
                gap: theme.spacing.xs,
              }}
            >
              <Skeleton width={38} height={38} radius={theme.radius.sm} />
              <Skeleton width={46} height={10} />
            </AppCard>
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Skeleton width={160} height={20} />
        {[0, 1].map((item) => (
          <AppCard
            key={item}
            padding="md"
            elevated={false}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.md,
            }}
          >
            <Skeleton width={50} height={50} radius={25} />
            <View style={{ flex: 1, gap: theme.spacing.sm }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="42%" height={11} />
              <Skeleton width="76%" height={11} />
            </View>
            <Skeleton width={62} height={22} radius={11} />
          </AppCard>
        ))}
      </View>
    </View>
  );
}