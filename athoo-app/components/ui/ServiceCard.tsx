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
          width: isSmall ? 70 : 82,
          minHeight: isSmall ? 86 : 96,
          paddingHorizontal: isSmall ? theme.spacing.xs : theme.spacing.sm,
          paddingVertical: isSmall ? theme.spacing.sm : theme.spacing.md,
          borderRadius: theme.radius.md,
          gap: theme.spacing.xs,
          backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
          borderColor: pressed ? theme.colors.primary : theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconBg,
          {
            width: isSmall ? 38 : 44,
            height: isSmall ? 38 : 44,
            borderRadius: theme.radius.sm,
            backgroundColor: appearance.background,
          },
        ]}
      >
        <Icon
          name={service.icon as any}
          size={isSmall ? 17 : 20}
          color={appearance.accent}
          strokeWidth={2.2}
        />
      </View>

      <AppText
        variant="caption"
        numberOfLines={2}
        align="center"
        style={[
          styles.name,
          { color: theme.colors.text },
          isUrdu && styles.urduText,
          isSmall && styles.smallName,
        ]}
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
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  iconBg: {
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    minHeight: 30,
    fontWeight: "600",
    lineHeight: 15,
  },
  smallName: {
    fontSize: 10,
    lineHeight: 13,
  },
  urduText: {
    writingDirection: "rtl",
  },
});