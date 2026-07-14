import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { AppearanceSelector } from "@/components/settings/AppearanceSelector";
import { AppCard, AppText } from "@/components/design";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

export default function AppearanceScreen() {
  const { theme } = useTheme();
  const { t } = useLang();

  return (
    <>
      <Stack.Screen
        options={{
          title: t.appearance,
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[styles.content, { padding: theme.spacing.xl }]}
      >
        <AppCard elevated={false} style={{ backgroundColor: theme.colors.surfaceAlt }}>
          <AppText variant="h2">{t.chooseTheme}</AppText>
          <AppText tone="secondary" style={{ marginTop: theme.spacing.sm }}>{t.themeHelp}</AppText>
        </AppCard>
        <AppearanceSelector />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 40 },
});
