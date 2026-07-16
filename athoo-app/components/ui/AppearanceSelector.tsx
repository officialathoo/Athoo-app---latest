import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearanceSelector() {
  const { theme, preference, setPreference } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Appearance</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Choose how Athoo looks on this device.</Text>
      <View style={[styles.segment, { backgroundColor: theme.colors.surfaceAlt }]}>
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => void setPreference(option.value)}
              style={[styles.option, selected && { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.optionText, { color: selected ? theme.colors.white : theme.colors.textSecondary }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16 },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 3, marginBottom: 12 },
  segment: { flexDirection: "row", padding: 4, borderRadius: 12 },
  option: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  optionText: { fontSize: 13, fontWeight: "700" },
});
