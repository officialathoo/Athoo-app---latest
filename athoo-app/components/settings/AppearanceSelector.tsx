import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

const OPTIONS: { value: ThemePreference; title: string; description: string; icon: string }[] = [
  { value: "system", title: "Use device setting", description: "Athoo follows your phone appearance automatically.", icon: "smartphone" },
  { value: "light", title: "Light", description: "Bright backgrounds for daytime use.", icon: "sun" },
  { value: "dark", title: "Dark", description: "Reduced brightness for low-light use.", icon: "moon" },
];

export function AppearanceSelector() {
  const { theme, preference, setPreference } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {OPTIONS.map((option, index) => {
        const selected = preference === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => void setPreference(option.value)}
            style={[
              styles.row,
              index < OPTIONS.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.colors.divider,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: selected ? theme.colors.infoSoft : theme.colors.surfaceAlt }]}>
              <Icon name={option.icon as any} size={20} color={selected ? theme.colors.primary : theme.colors.textSecondary} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: theme.colors.text }]}>{option.title}</Text>
              <Text style={[styles.description, { color: theme.colors.textSecondary }]}>{option.description}</Text>
            </View>
            <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
              {selected ? <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { minHeight: 86, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700" },
  description: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
