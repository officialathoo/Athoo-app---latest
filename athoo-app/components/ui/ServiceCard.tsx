import { Icon } from "@/components/ui/Icon";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/design";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { ServiceCategory } from "@/data/services";
import { getCategoryAppearance } from "@/utils/categoryAppearance";

interface ServiceCardProps {
  service: ServiceCategory;
  onPress: () => void;
  size?: "sm" | "md";
}

export function ServiceCard({ service, onPress, size = "md" }: ServiceCardProps) {
  const { isUrdu } = useLang();
  const { theme } = useTheme();
  const isSmall = size === "sm";
  const displayName = isUrdu ? service.nameUrdu : service.name;
  const appearance = getCategoryAppearance(service, theme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayName} service`}
      accessibilityHint="Opens available service providers"
      style={({ pressed }) => [
        styles.card,
        {
          width: isSmall ? 76 : 92,
          padding: isSmall ? theme.spacing.sm : theme.spacing.md,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        theme.shadows.sm,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconBg,
          {
            width: isSmall ? 42 : 52,
            height: isSmall ? 42 : 52,
            borderRadius: theme.radius.md,
            backgroundColor: appearance.background,
          },
        ]}
      >
        <Icon name={service.icon as any} size={isSmall ? 18 : 22} color={appearance.accent} />
      </View>
      <AppText
        variant="caption"
        numberOfLines={2}
        align="center"
        style={[styles.name, { color: theme.colors.text }, isUrdu && styles.urduText, isSmall && { fontSize: 10 }]}
      >
        {displayName}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderWidth: 1,
    minHeight: 112,
    justifyContent: "flex-start",
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  iconBg: { alignItems: "center", justifyContent: "center" },
  name: { minHeight: 34, fontWeight: "600" },
  urduText: { writingDirection: "rtl" },
});
