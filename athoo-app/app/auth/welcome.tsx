import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { AppText } from "@/components/design";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { getBiometricType, getBiometricRole } from "@/services/biometric";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 40 : insets.top;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom;
  const { requiresBiometric, completeBiometricLogin } = useAuth();
  const { t } = useLang();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [biometricType, setBiometricType] = useState<"face" | "fingerprint" | "iris" | "biometric" | "none">("none");
  const [bioRole, setBioRole] = useState<string>("customer");
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState("");

  const trustPoints = useMemo(() => [
    { icon: "shield-check", text: "Verified providers" },
    { icon: "map-pin", text: "Across Pakistan" },
    { icon: "message-circle", text: "Secure chat & call" },
  ], []);

  useEffect(() => {
    if (requiresBiometric) {
      getBiometricType().then(setBiometricType);
      getBiometricRole().then(setBioRole);
    }
  }, [requiresBiometric]);

  const handleBiometricLogin = async () => {
    setBioError("");
    setBioLoading(true);
    const result = await completeBiometricLogin();
    setBioLoading(false);
    if (result.success) return;
    if (result.error === "Session expired. Please login again.") {
      setBioError(t.sessionExpired);
      setTimeout(() => router.push(`/auth/login?role=${bioRole}` as never), 1200);
      return;
    }
    setBioError(t.authenticationCancelled);
  };

  const biometricTitle = biometricType === "face"
    ? t.signInWithFaceId
    : biometricType === "iris"
      ? t.signInWithIris
      : biometricType === "fingerprint"
        ? t.signInWithFingerprint
        : "Sign in with device biometrics";
  const biometricHint = biometricType === "face"
    ? t.biometricFaceHint
    : biometricType === "iris"
      ? t.biometricIrisHint
      : biometricType === "fingerprint"
        ? t.biometricFingerprintHint
        : "Use the biometric method enrolled on this phone.";

  const gradientStart = theme.dark ? "#07111F" : theme.colors.primaryPressed;
  const gradientEnd = theme.dark ? "#0B1F35" : theme.colors.primary;

  return (
    <LinearGradient
      colors={[gradientStart, gradientEnd]}
      start={{ x: 0.12, y: 0 }}
      end={{ x: 0.88, y: 1 }}
      style={styles.gradient}
      testID="welcome-screen"
    >
      <View pointerEvents="none" style={styles.orbTop} />
      <View pointerEvents="none" style={styles.orbBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: topPad + 18, paddingBottom: bottomPad + 18 },
        ]}
      >
        <View style={styles.brandSection}>
          <View style={styles.logoHalo}>
            <View style={styles.logoContainer}>
              <Image
                source={brandConfig.assets.mark}
                style={styles.logoImage}
                resizeMode="cover"
                accessibilityLabel="Athoo logo"
              />
            </View>
          </View>
          <View style={styles.titleBlock}>
            <AppText variant="h1" tone="inverse" align="center" style={styles.tagline}>
              {t.welcomeTagline}
            </AppText>
            <AppText variant="caption" tone="inverse" align="center" style={styles.subTagline}>
              Trusted home services, wherever you are in {t.pakistan}
            </AppText>
          </View>
        </View>

        {requiresBiometric ? (
          <View style={styles.actionPanel}>
            <View style={styles.panelHeading}>
              <AppText variant="caption" tone="inverse" style={styles.eyebrow}>SECURE RETURN</AppText>
              <AppText variant="h3" tone="inverse">Welcome back</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={biometricTitle}
              accessibilityState={{ busy: bioLoading }}
              style={({ pressed }) => [styles.biometricCard, pressed && styles.pressed]}
              onPress={handleBiometricLogin}
              disabled={bioLoading}
            >
              {bioLoading ? (
                <ActivityIndicator color={theme.colors.primary} size="large" />
              ) : (
                <>
                  <View style={styles.biometricIcon}>
                    <Icon
                      name={biometricType === "face" ? "scan-face" : biometricType === "iris" ? "eye" : biometricType === "fingerprint" ? "fingerprint" : "shield"}
                      size={34}
                      color={theme.colors.primary}
                      strokeWidth={1.7}
                    />
                  </View>
                  <View style={styles.biometricCopy}>
                    <AppText variant="bodyStrong">{biometricTitle}</AppText>
                    <AppText variant="caption" tone="secondary">{biometricHint}</AppText>
                  </View>
                  <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
                </>
              )}
            </Pressable>
            {bioError ? (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={16} color={theme.colors.danger} />
                <AppText variant="caption" tone="danger" style={styles.errorText}>{bioError}</AppText>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondaryLink, pressed && styles.linkPressed]}
              onPress={() => router.push(`/auth/login?role=${bioRole}` as never)}
            >
              <Icon name="phone" size={15} color={theme.colors.white} />
              <AppText variant="label" tone="inverse">{t.signInWithOtpInstead}</AppText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionPanel}>
            <View style={styles.panelHeading}>
              <AppText variant="caption" tone="inverse" style={styles.eyebrow}>GET STARTED</AppText>
              <AppText variant="h3" tone="inverse">Continue with Athoo</AppText>
              <AppText variant="caption" tone="inverse" style={styles.panelDescription}>
                Select an option, then choose Customer or Service Provider.
              </AppText>
            </View>

            <View style={styles.actionStack}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                testID="welcome-sign-in"
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
                onPress={() => router.push("/auth/choose-role?mode=signin" as never)}
              >
                <View style={styles.primaryActionIcon}>
                  <Icon name="log-in" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.primaryActionCopy}>
                  <AppText variant="bodyStrong">Sign in</AppText>
                  <AppText variant="caption" tone="secondary">Use your existing Athoo account</AppText>
                </View>
                <Icon name="arrow-right" size={18} color={theme.colors.primary} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create account"
                testID="welcome-sign-up"
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                onPress={() => router.push("/auth/choose-role?mode=signup" as never)}
              >
                <View style={styles.secondaryActionIcon}>
                  <Icon name="user-plus" size={20} color={theme.colors.white} />
                </View>
                <View style={styles.primaryActionCopy}>
                  <AppText variant="bodyStrong" tone="inverse">Create account</AppText>
                  <AppText variant="caption" tone="inverse" style={styles.secondaryActionHint}>Join Athoo in a few steps</AppText>
                </View>
                <Icon name="arrow-right" size={18} color={theme.colors.white} />
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.trustRow}>
          {trustPoints.map((item) => (
            <View key={item.text} style={styles.trustItem}>
              <Icon name={item.icon as never} size={15} color={theme.colors.white} />
              <AppText variant="caption" tone="inverse" style={styles.trustText}>{item.text}</AppText>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    gradient: { flex: 1, overflow: "hidden" },
    orbTop: {
      position: "absolute", width: 320, height: 320, borderRadius: 160,
      top: -150, right: -120, backgroundColor: "rgba(56,189,248,0.14)",
    },
    orbBottom: {
      position: "absolute", width: 260, height: 260, borderRadius: 130,
      bottom: -145, left: -105, backgroundColor: "rgba(249,115,22,0.16)",
    },
    container: {
      flexGrow: 1,
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      gap: 18,
    },
    brandSection: { alignItems: "center", gap: 14, paddingTop: 2 },
    logoHalo: {
      width: 116, height: 116, borderRadius: 34,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
      alignItems: "center", justifyContent: "center",
      shadowColor: "#38BDF8", shadowOpacity: 0.20, shadowRadius: 22,
      shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    logoContainer: {
      width: 94, height: 94, borderRadius: 27,
      backgroundColor: theme.colors.white,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.82)",
      ...theme.shadows.md,
    },
    logoImage: { width: "100%", height: "100%", borderRadius: 26 },
    titleBlock: { alignItems: "center", gap: 5, maxWidth: 390 },
    tagline: { fontSize: 25, lineHeight: 31, letterSpacing: -0.45 },
    subTagline: { opacity: 0.72, maxWidth: 340, lineHeight: 18 },
    actionPanel: {
      borderRadius: 26,
      padding: 17,
      gap: 15,
      backgroundColor: "rgba(4,12,24,0.72)",
      borderWidth: 1,
      borderColor: "rgba(148,163,184,0.22)",
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    panelHeading: { gap: 4, paddingHorizontal: 2 },
    eyebrow: { opacity: 0.56, letterSpacing: 1.45, fontSize: 9.5 },
    panelDescription: { opacity: 0.68, marginTop: 1 },
    actionStack: { gap: 9 },
    primaryAction: {
      minHeight: 62,
      borderRadius: 17,
      paddingHorizontal: 13,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.72)",
      ...theme.shadows.sm,
    },
    secondaryAction: {
      minHeight: 62,
      borderRadius: 17,
      paddingHorizontal: 13,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.28)",
    },
    primaryActionIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: theme.colors.infoSoft,
      alignItems: "center", justifyContent: "center",
    },
    secondaryActionIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: "rgba(249,115,22,0.32)",
      alignItems: "center", justifyContent: "center",
    },
    primaryActionCopy: { flex: 1, gap: 1 },
    secondaryActionHint: { opacity: 0.70 },
    biometricCard: {
      minHeight: 74,
      borderRadius: 17,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    biometricIcon: {
      width: 48, height: 48, borderRadius: 15,
      backgroundColor: theme.colors.infoSoft,
      alignItems: "center", justifyContent: "center",
    },
    biometricCopy: { flex: 1, gap: 2 },
    errorBox: {
      borderRadius: 12, padding: 10,
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: theme.colors.dangerSoft,
    },
    errorText: { flex: 1 },
    secondaryLink: {
      minHeight: 42, flexDirection: "row", alignItems: "center",
      justifyContent: "center", gap: 8,
    },
    linkPressed: { opacity: 0.7 },
    pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
    trustRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      columnGap: 14,
      rowGap: 8,
      paddingHorizontal: 4,
    },
    trustItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    trustText: { opacity: 0.72, fontSize: 10.5 },
  });
}
