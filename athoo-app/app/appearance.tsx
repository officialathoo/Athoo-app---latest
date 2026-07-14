import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Stack } from "expo-router";
import { AppearanceSelector } from "@/components/settings/AppearanceSelector";
import { useTheme } from "@/context/ThemeContext";

export default function AppearanceScreen() {
  const { theme } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Appearance", headerStyle: { backgroundColor: theme.colors.surface }, headerTintColor: theme.colors.text }} />
      <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.colors.text }]}>Choose your theme</Text>
        <Text style={[styles.help, { color: theme.colors.textSecondary }]}>This preference is saved on this device and applies across Athoo.</Text>
        <AppearanceSelector />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 10 },
  heading: { fontSize: 24, fontWeight: "800", marginTop: 8 },
  help: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
});
