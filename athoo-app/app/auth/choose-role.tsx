import { AppText } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
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
  const styles = useMemo(() => createStyles(theme), [theme]);

  function continueAs(role: "customer" | "provider") {
    if (mode === "signin") {
      router.push(`/auth/login?role=${role}` as never);
      return;
    }
    router.push((role === "provider" ? "/auth/provider-register" : "/auth/register?role=customer") as never);
  }

  return (
    <LinearGradient
      colors={[theme.colors.primary, theme.colors.primaryPressed]}
      start={{ x: 0.08, y: 0 }}
      end={{ x: 0.92, y: 1 }}
      style={styles.fill}
    >
      <View pointerEvents="none" style={styles.orb} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: (Platform.OS === "web" ? 36 : insets.top) + 14, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon name="arrow-left" size={19} color={theme.colors.onBrand} />
          </Pressable>
          <View style={styles.modeBadge}>
            <Icon name={mode === "signin" ? "log-in" : "user-plus"} size={14} color={theme.colors.white} />
            <AppText variant="caption" tone="inverse" style={styles.modeBadgeText}>
              {mode === "signin" ? "SIGN IN" : "NEW ACCOUNT"}
            </AppText>
          </View>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.heading}>
          <AppText variant="h1" tone="inverse" align="center">
            {mode === "signin" ? "How do you use Athoo?" : "Choose your account type"}
          </AppText>
          <AppText variant="body" tone="inverse" align="center" style={styles.subtitle}>
            We will open the correct {mode === "signin" ? "secure sign-in" : "registration"} flow for your role.
          </AppText>
        </View>

        <View style={styles.selectionPanel}>
          <AppText variant="caption" tone="muted" style={styles.sectionLabel}>SELECT ONE OPTION</AppText>

          <View style={styles.cards}>
            <Pressable
              testID={`auth-${mode}-customer`}
              accessibilityRole="button"
              style={({ pressed }) => [styles.roleCard, pressed && styles.rolePressed]}
              onPress={() => continueAs("customer")}
            >
              <View style={[styles.accentBar, { backgroundColor: theme.colors.primary }]} />
              <View style={[styles.roleIcon, { backgroundColor: theme.colors.infoSoft }]}>
                <Icon name="user" size={25} color={theme.colors.primary} />
              </View>
              <View style={styles.copy}>
                <AppText variant="h3" numberOfLines={1}>Customer</AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={2}>
                  Find trusted professionals, manage bookings, chats, invoices and refunds.
                </AppText>
              </View>
              <View style={styles.chevronCircle}>
                <Icon name="chevron-right" size={17} color={theme.colors.primary} />
              </View>
            </Pressable>

            <Pressable
              testID={`auth-${mode}-provider`}
              accessibilityRole="button"
              style={({ pressed }) => [styles.roleCard, pressed && styles.rolePressed]}
              onPress={() => continueAs("provider")}
            >
              <View style={[styles.accentBar, { backgroundColor: theme.colors.secondary }]} />
              <View style={[styles.roleIcon, { backgroundColor: theme.colors.premiumSoft }]}>
                <Icon name="briefcase" size={25} color={theme.colors.secondary} />
              </View>
              <View style={styles.copy}>
                <AppText variant="h3" numberOfLines={1}>Service Provider</AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={2}>
                  Receive jobs, negotiate, manage verification, availability and earnings.
                </AppText>
              </View>
              <View style={styles.chevronCircle}>
                <Icon name="chevron-right" size={17} color={theme.colors.secondary} />
              </View>
            </Pressable>
          </View>

          <View style={styles.securityNote}>
            <Icon name="shield-check" size={16} color={theme.colors.success} />
            <AppText variant="caption" tone="secondary" style={styles.securityCopy}>
              Your role controls the correct dashboard and verification requirements.
            </AppText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.switchMode, pressed && styles.pressed]}
          onPress={() => router.replace(`/auth/choose-role?mode=${mode === "signin" ? "signup" : "signin"}` as never)}
        >
          <AppText variant="body" tone="inverse">
            {mode === "signin" ? "New to Athoo? " : "Already registered? "}
          </AppText>
          <AppText variant="bodyStrong" tone="inverse">
            {mode === "signin" ? "Create an account" : "Sign in"}
          </AppText>
          <Icon name="arrow-right" size={16} color={theme.colors.white} />
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    fill: { flex: 1, overflow: "hidden" },
    orb: {
      position: "absolute", width: 280, height: 280, borderRadius: 140,
      top: -120, right: -110, backgroundColor: "rgba(255,255,255,0.07)",
    },
    content: {
      flexGrow: 1,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      paddingHorizontal: 20,
      gap: 20,
    },
    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    back: {
      width: 40, height: 40, borderRadius: 13,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
      alignItems: "center", justifyContent: "center",
    },
    modeBadge: {
      minHeight: 30, borderRadius: 999, paddingHorizontal: 12,
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "rgba(255,255,255,0.13)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    },
    modeBadgeText: { fontSize: 10, letterSpacing: 1.05, opacity: 0.88 },
    topSpacer: { width: 40 },
    heading: { alignItems: "center", gap: 7, paddingHorizontal: 8, marginTop: 2 },
    subtitle: { opacity: 0.76, maxWidth: 390 },
    selectionPanel: {
      marginTop: 6,
      borderRadius: 24,
      padding: 16,
      gap: 13,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.58)",
      ...theme.shadows.lg,
    },
    sectionLabel: { fontSize: 10, letterSpacing: 1.15 },
    cards: { gap: 10 },
    roleCard: {
      minHeight: 94,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: theme.colors.surfaceAlt,
      overflow: "hidden",
    },
    accentBar: { position: "absolute", left: 0, top: 15, bottom: 15, width: 3, borderRadius: 3 },
    roleIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    copy: { flex: 1, minWidth: 0, gap: 5 },
    chevronCircle: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: "center", justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1, borderColor: theme.colors.border,
    },
    securityNote: {
      minHeight: 42, borderRadius: 13, paddingHorizontal: 11,
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: theme.colors.successSoft,
    },
    securityCopy: { flex: 1 },
    rolePressed: { opacity: 0.88, transform: [{ scale: 0.994 }] },
    pressed: { opacity: 0.75 },
    switchMode: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
      gap: 4,
      marginTop: "auto",
    },
  });
}
