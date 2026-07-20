import { AppText } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChooseRoleScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode === "signup" ? "signup" : "signin";
  const styles = useMemo(() => createStyles(), []);

  function continueAs(role: "customer" | "provider") {
    if (mode === "signin") {
      router.push(`/auth/login?role=${role}` as never);
      return;
    }
    router.push((role === "provider" ? "/auth/provider-register" : "/auth/register?role=customer") as never);
  }

  return (
    <LinearGradient colors={[theme.colors.primary, theme.colors.primaryPressed]} style={styles.fill}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: (Platform.OS === "web" ? 40 : insets.top) + 18, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={theme.colors.onBrand} />
        </Pressable>

        <View style={styles.heading}>
          <AppText variant="h1" tone="inverse" align="center">
            {mode === "signin" ? "Sign in as" : "Create account as"}
          </AppText>
          <AppText tone="inverse" align="center" style={styles.subtitle}>
            Choose your role. Athoo will open the correct {mode === "signin" ? "sign-in" : "registration"} form.
          </AppText>
        </View>

        <View style={styles.cards}>
          <Pressable
            testID={`auth-${mode}-customer`}
            accessibilityRole="button"
            style={({ pressed }) => [styles.roleCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed && styles.pressed]}
            onPress={() => continueAs("customer")}
          >
            <View style={[styles.roleIcon, { backgroundColor: theme.colors.infoSoft }]}>
              <Icon name="user" size={34} color={theme.colors.primary} />
            </View>
            <View style={styles.copy}>
              <AppText variant="h2">Customer</AppText>
              <AppText tone="secondary">Book trusted services, manage jobs, refunds, chats and invoices.</AppText>
            </View>
            <Icon name="chevron-right" size={22} color={theme.colors.textMuted} />
          </Pressable>

          <Pressable
            testID={`auth-${mode}-provider`}
            accessibilityRole="button"
            style={({ pressed }) => [styles.roleCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.secondary }, pressed && styles.pressed]}
            onPress={() => continueAs("provider")}
          >
            <View style={[styles.roleIcon, { backgroundColor: theme.colors.successSoft }]}>
              <Icon name="briefcase" size={34} color={theme.colors.secondary} />
            </View>
            <View style={styles.copy}>
              <AppText variant="h2">Service Provider</AppText>
              <AppText tone="secondary">Receive jobs, negotiate, manage documents, earnings and availability.</AppText>
            </View>
            <Icon name="chevron-right" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.switchMode}
          onPress={() => router.replace(`/auth/choose-role?mode=${mode === "signin" ? "signup" : "signin"}` as never)}
        >
          <AppText variant="label" tone="inverse">
            {mode === "signin" ? "New to Athoo? Create an account" : "Already registered? Sign in"}
          </AppText>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

const createStyles = () => StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: 20, gap: 24 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  heading: { gap: 8, marginTop: 18 },
  subtitle: { opacity: 0.82 },
  cards: { gap: 14, marginTop: 16 },
  roleCard: { minHeight: 132, borderRadius: 22, borderWidth: 1.5, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  roleIcon: { width: 66, height: 66, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 5 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  switchMode: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: "auto" },
});
