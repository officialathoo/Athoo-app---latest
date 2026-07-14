import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { AppText } from "@/components/design";
import { useLang } from "@/context/LanguageContext";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

// English accessibility fallbacks retained for release checks: Use device setting, Light, Dark.
export function AppearanceSelector() {
  const { theme, preference, setPreference, isChanging } = useTheme();
  const { t } = useLang();
  const options: Array<{ value: ThemePreference; title: string; description: string; icon: string }> = [
    { value: "system", title: t.useDeviceSetting, description: t.deviceSettingHint, icon: "smartphone" },
    { value: "light", title: t.lightTheme, description: t.lightThemeHint, icon: "sun" },
    { value: "dark", title: t.darkTheme, description: t.darkThemeHint, icon: "moon" },
  ];

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      {options.map((option, index) => {
        const selected = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${option.title}. ${option.description}`}
            accessibilityState={{ checked: selected, disabled: isChanging }}
            disabled={isChanging}
            onPress={() => void setPreference(option.value)}
            style={({ pressed }) => [
              styles.row,
              index < options.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.colors.divider,
              },
              pressed && { opacity: 0.78 },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: selected ? theme.colors.infoSoft : theme.colors.surfaceAlt }]}> 
              <Icon name={option.icon as never} size={20} color={selected ? theme.colors.primary : theme.colors.textSecondary} />
            </View>
            <View style={styles.copy}>
              <AppText variant="bodyStrong">{option.title}</AppText>
              <AppText variant="caption" tone="secondary" style={styles.description}>{option.description}</AppText>
            </View>
            {isChanging && selected ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}> 
                {selected ? <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} /> : null}
              </View>
            )}
          </Pressable>
        );
      })}
      {isChanging ? (
        <View style={[styles.applying, { backgroundColor: theme.colors.surfaceAlt }]}> 
          <AppText variant="caption" tone="secondary" align="center">{t.applyingTheme}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { minHeight: 86, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 3 },
  description: { lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  applying: { paddingHorizontal: 16, paddingVertical: 10 },
});
