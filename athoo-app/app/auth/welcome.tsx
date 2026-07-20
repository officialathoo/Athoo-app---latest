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
import { getBiometricType, getBiometricRole } from "@/services/biometric";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 48 : insets.top;
  const bottomPad = Platform.OS === "web" ? 28 : insets.bottom;
  const { requiresBiometric, completeBiometricLogin } = useAuth();
  const { t } = useLang();
  const { theme } = useTheme();
  const [biometricType, setBiometricType] = useState<"face" | "fingerprint" | "iris" | "biometric" | "none">("none");
  const [bioRole, setBioRole] = useState<string>("customer");
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState("");

  const features = useMemo(() => [
    { icon: "search", text: t.findSkilledWorkers },
    { icon: "map-pin", text: t.liveLocationTracking },
    { icon: "clock", text: t.bookNowOrLater },
    { icon: "message-circle", text: t.chatAndCall },
  ], [t]);

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

  const gradientEnd = theme.dark ? theme.colors.elevated : theme.colors.primaryPressed;

  return (
    <LinearGradient colors={[theme.colors.primary, gradientEnd]} style={styles.gradient} testID="welcome-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: topPad + 20, paddingBottom: bottomPad + 20, paddingHorizontal: theme.spacing.xl },
        ]}
      >
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Image source={brandConfig.assets.mark} style={styles.logoImage} resizeMode="contain" />
          </View>
          <AppText variant="h1" tone="inverse" align="center" style={styles.tagline}>{t.welcomeTagline}</AppText>
          <AppText variant="label" tone="inverse" align="center" style={styles.subTagline}>{t.pakistan}</AppText>
        </View>

        {requiresBiometric ? (
          <View style={styles.biometricSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={biometricTitle}
              accessibilityState={{ busy: bioLoading }}
              style={({ pressed }) => [
                styles.biometricCard,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                pressed && { opacity: 0.88 },
              ]}
              onPress={handleBiometricLogin}
              disabled={bioLoading}
            >
              {bioLoading ? (
                <ActivityIndicator color={theme.colors.primary} size="large" />
              ) : (
                <>
                  <View style={[styles.biometricIcon, { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.primary }]}> 
                    <Icon
                      name={biometricType === "face" ? "scan-face" : biometricType === "iris" ? "eye" : biometricType === "fingerprint" ? "fingerprint" : "shield"}
                      size={50}
                      color={theme.colors.primary}
                      strokeWidth={1.5}
                    />
                  </View>
                  <AppText variant="h2" align="center">{biometricTitle}</AppText>
                  <AppText tone="secondary" align="center">{biometricHint}</AppText>
                </>
              )}
            </Pressable>
            {bioError ? (
              <View style={[styles.errorBox, { backgroundColor: theme.colors.danger }]}> 
                <Icon name="alert-circle" size={16} color={theme.colors.white} />
                <AppText variant="caption" tone="inverse" style={styles.errorText}>{bioError}</AppText>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.otpFallback, pressed && { opacity: 0.74 }]}
              onPress={() => router.push(`/auth/login?role=${bioRole}` as never)}
            >
              <Icon name="phone" size={15} color={theme.colors.white} />
              <AppText variant="label" tone="inverse">{t.signInWithOtpInstead}</AppText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.featuresCard}>
            {features.map((feature) => (
              <View key={feature.icon} style={styles.featureRow}>
                <View style={[styles.featureIcon, { backgroundColor: theme.colors.surface }]}> 
                  <Icon name={feature.icon as never} size={18} color={theme.colors.primary} />
                </View>
                <AppText tone="inverse" style={styles.featureText}>{feature.text}</AppText>
              </View>
            ))}
          </View>
        )}

        {!requiresBiometric ? (
          <View style={styles.actions}>
            <AppText variant="h2" tone="inverse" align="center">Welcome to Athoo</AppText>
            <AppText variant="caption" tone="inverse" align="center" style={styles.mutedInverse}>
              Choose what you want to do. You will select Customer or Provider on the next screen.
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              testID="welcome-sign-in"
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/auth/choose-role?mode=signin" as never)}
            >
              <View style={[styles.primaryActionIcon, { backgroundColor: theme.colors.infoSoft }]}>
                <Icon name="log-in" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.primaryActionCopy}>
                <AppText variant="bodyStrong">Sign in</AppText>
                <AppText variant="caption" tone="secondary">I already have an Athoo account</AppText>
              </View>
              <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create account"
              testID="welcome-sign-up"
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.secondary },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/auth/choose-role?mode=signup" as never)}
            >
              <View style={[styles.primaryActionIcon, { backgroundColor: theme.colors.successSoft }]}>
                <Icon name="user-plus" size={24} color={theme.colors.secondary} />
              </View>
              <View style={styles.primaryActionCopy}>
                <AppText variant="bodyStrong">Create account</AppText>
                <AppText variant="caption" tone="secondary">I am new to Athoo</AppText>
              </View>
              <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "space-between", gap: 24 },
  logoSection: { alignItems: "center", gap: 8 },
  logoContainer: {
    width: 168,
    height: 168,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  logoImage: { width: 148, height: 148 },
  tagline: { marginTop: 10, maxWidth: 420 },
  subTagline: { opacity: 0.78 },
  biometricSection: { alignItems: "center", gap: 16 },
  biometricCard: { width: "100%", minHeight: 220, borderRadius: 28, borderWidth: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 14 },
  biometricIcon: { width: 92, height: 92, borderRadius: 46, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  errorBox: { width: "100%", borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { flex: 1 },
  otpFallback: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  featuresCard: { borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "rgba(255,255,255,0.12)" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1 },
  actions: { gap: 12 },
  primaryAction: { minHeight: 78, borderRadius: 18, borderWidth: 1.5, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  primaryActionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryActionCopy: { flex: 1, gap: 2 },
  mutedInverse: { opacity: 0.8 },
  roleButtons: { flexDirection: "row", gap: 12 },
  roleButton: { flex: 1, minHeight: 148, borderRadius: 18, borderWidth: 1, padding: 14, alignItems: "center", justifyContent: "center", gap: 6 },
  verifiedTag: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  signInSection: { gap: 10 },
  signInButtons: { flexDirection: "row", gap: 10 },
  signInButton: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
