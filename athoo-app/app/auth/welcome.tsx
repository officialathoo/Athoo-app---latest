import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { createAuthPalette, type AuthPalette } from "@/design/authPalette";
import { redesign } from "@/design/redesign";
import {
  getBiometricRole,
  getBiometricType,
} from "@/services/biometric";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 34 : insets.top;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom;
  const { requiresBiometric, completeBiometricLogin } = useAuth();
  const { t } = useLang();
  const { theme } = useTheme();
  const auth = useMemo(() => createAuthPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme, auth), [auth, theme]);

  const [biometricType, setBiometricType] = useState<
    "face" | "fingerprint" | "iris" | "biometric" | "none"
  >("none");
  const [bioRole, setBioRole] = useState("customer");
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState("");

  const intro = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(intro, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [glow, intro]);

  useEffect(() => {
    if (!requiresBiometric) return;
    void getBiometricType().then(setBiometricType);
    void getBiometricRole().then(setBioRole);
  }, [requiresBiometric]);

  const features = useMemo(
    () => [
      {
        icon: "shield-check",
        title: "Secure & Trusted",
        description:
          "Verified providers, protected accounts and safer service records.",
        color: auth.cyan,
        background: auth.cyanSoft,
      },
      {
        icon: "map-pin",
        title: "Built for Pakistan",
        description:
          "Find and manage home services across cities and service areas.",
        color: auth.orange,
        background: auth.orangeSoft,
      },
    ],
    [auth],
  );

  const handleBiometricLogin = async () => {
    setBioError("");
    setBioLoading(true);
    const result = await completeBiometricLogin();
    setBioLoading(false);

    if (result.success) return;

    if (result.error === "Session expired. Please login again.") {
      setBioError(t.sessionExpired);
      setTimeout(
        () =>
          router.push(
            `/auth/login?role=${bioRole}` as never,
          ),
        1200,
      );
      return;
    }

    setBioError(t.authenticationCancelled);
  };

  const biometricTitle =
    biometricType === "face"
      ? t.signInWithFaceId
      : biometricType === "iris"
        ? t.signInWithIris
        : biometricType === "fingerprint"
          ? t.signInWithFingerprint
          : "Sign in with device biometrics";

  const biometricHint =
    biometricType === "face"
      ? t.biometricFaceHint
      : biometricType === "iris"
        ? t.biometricIrisHint
        : biometricType === "fingerprint"
          ? t.biometricFingerprintHint
          : "Use the biometric method enrolled on this phone.";

  const introStyle = {
    opacity: intro,
    transform: [
      {
        translateY: intro.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  const glowStyle = {
    opacity: glow.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 1],
    }),
    transform: [
      {
        scale: glow.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1.04],
        }),
      },
    ],
  };

  return (
    <View style={styles.root} testID="welcome-screen">
      <LinearGradient
        colors={
          theme.dark
            ? [auth.heroInk, auth.background, auth.backgroundDeep]
            : [theme.colors.infoSoft, auth.background, auth.backgroundDeep]
        }
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[styles.topGlow, glowStyle]}
      />
      <View pointerEvents="none" style={styles.orangeGlow} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: topPad + 18,
            paddingBottom: bottomPad + 18,
          },
        ]}
      >
        <Animated.View style={[styles.content, introStyle]}>
          <View style={styles.brandBlock}>
            <View style={styles.logoHalo}>
              <View style={styles.logoShell}>
                <Image
                  source={brandConfig.assets.mark}
                  style={styles.logoImage}
                  resizeMode="cover"
                  accessibilityLabel="Athoo logo"
                />
              </View>
            </View>

            <Text style={styles.welcomeLabel}>WELCOME TO</Text>
            <Text style={styles.brandName}>
              {brandConfig.displayName}
            </Text>
            <Text style={styles.brandTagline}>
              {t.welcomeTagline}
            </Text>
          </View>

          <View style={styles.devicePanel}>
            <View style={styles.deviceNotch} />
            <View style={styles.panelIntro}>
              <Text style={styles.panelTitle}>
                Home services, simplified.
              </Text>
              <Text style={styles.panelCopy}>
                Book trusted professionals or grow your service
                business from one secure Athoo account.
              </Text>
            </View>

            <View style={styles.featureStack}>
              {features.map((feature) => (
                <View
                  key={feature.title}
                  style={styles.featureCard}
                >
                  <View
                    style={[
                      styles.featureIcon,
                      {
                        backgroundColor:
                          feature.background,
                      },
                    ]}
                  >
                    <Icon
                      name={feature.icon}
                      size={20}
                      color={feature.color}
                    />
                  </View>

                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>
                      {feature.title}
                    </Text>
                    <Text style={styles.featureDescription}>
                      {feature.description}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {requiresBiometric ? (
            <View style={styles.secureReturnCard}>
              <View style={styles.secureReturnHeading}>
                <View style={styles.secureReturnBadge}>
                  <Icon
                    name="shield-check"
                    size={13}
                    color={auth.success}
                  />
                  <Text style={styles.secureReturnBadgeText}>
                    SECURE RETURN
                  </Text>
                </View>
                <Text style={styles.secureReturnTitle}>
                  Welcome back
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={biometricTitle}
                accessibilityState={{ busy: bioLoading }}
                onPress={handleBiometricLogin}
                disabled={bioLoading}
                style={({ pressed }) => [
                  styles.biometricButton,
                  pressed && styles.pressed,
                ]}
              >
                {bioLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={auth.cyan}
                  />
                ) : (
                  <View style={styles.biometricIcon}>
                    <Icon
                      name={
                        biometricType === "face"
                          ? "scan-face"
                          : biometricType === "iris"
                            ? "eye"
                            : biometricType === "fingerprint"
                              ? "fingerprint"
                              : "shield"
                      }
                      size={24}
                      color={auth.cyan}
                    />
                  </View>
                )}

                <View style={styles.biometricCopy}>
                  <Text style={styles.biometricTitle}>
                    {biometricTitle}
                  </Text>
                  <Text style={styles.biometricHint}>
                    {biometricHint}
                  </Text>
                </View>

                <Icon
                  name="chevron-right"
                  size={18}
                  color={auth.muted}
                />
              </Pressable>

              {bioError ? (
                <View style={styles.errorBox}>
                  <Icon
                    name="alert-circle"
                    size={15}
                    color={auth.danger}
                  />
                  <Text style={styles.errorText}>
                    {bioError}
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    `/auth/login?role=${bioRole}` as never,
                  )
                }
                style={({ pressed }) => [
                  styles.otpFallback,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name="phone"
                  size={15}
                  color={auth.text}
                />
                <Text style={styles.otpFallbackText}>
                  {t.signInWithOtpInstead}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                testID="welcome-sign-in"
                onPress={() =>
                  router.push(
                    "/auth/choose-role?mode=signin" as never,
                  )
                }
                style={({ pressed }) => [
                  styles.actionPressable,
                  pressed && styles.pressed,
                ]}
              >
                <LinearGradient
                  colors={[
                    auth.cyan,
                    brandConfig.colors.primary,
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.primaryAction}
                >
                  <Icon
                    name="log-in"
                    size={18}
                    color={theme.colors.white}
                  />
                  <Text style={styles.primaryButtonText}>
                    Log in
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create account"
                testID="welcome-sign-up"
                onPress={() =>
                  router.push(
                    "/auth/choose-role?mode=signup" as never,
                  )
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name="user-plus"
                  size={17}
                  color={auth.text}
                />
                <Text style={styles.secondaryButtonText}>
                  Create Account
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change language"
            onPress={() =>
              router.push("/language" as never)
            }
            style={({ pressed }) => [
              styles.languageRow,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.languageText}>
              {t.english}
            </Text>
            <View style={styles.languageDivider} />
            <Text style={styles.languageText}>
              {t.urdu}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AthooTheme, auth: AuthPalette) {
  return StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  topGlow: {
    position: "absolute",
    top: -145,
    alignSelf: "center",
    width: 420,
    height: 310,
    borderRadius: 220,
    backgroundColor: auth.cyanGlow,
  },
  orangeGlow: {
    position: "absolute",
    right: -120,
    bottom: 90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(249, 115, 22, 0.09)",
  },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: redesign.layout.maxContentWidth,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: redesign.layout.horizontalPadding,
  },
  content: {
    width: "100%",
    gap: 17,
  },
  brandBlock: {
    alignItems: "center",
  },
  logoHalo: {
    width: 86,
    height: 86,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37, 183, 232, 0.10)",
    borderWidth: 1,
    borderColor: auth.borderStrong,
    shadowColor: auth.cyan,
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 9 },
    elevation: 9,
    marginBottom: 12,
  },
  logoShell: {
    width: 70,
    height: 70,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: theme.colors.white,
  },
  logoImage: { width: "100%", height: "100%", borderRadius: 29 },
  welcomeLabel: {
    color: auth.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.7,
  },
  brandName: {
    marginTop: 3,
    color: auth.text,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  brandTagline: {
    marginTop: 4,
    color: auth.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  devicePanel: {
    position: "relative",
    borderRadius: theme.radius.xl,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: auth.borderStrong,
    ...theme.shadows.md,
  },
  deviceNotch: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  panelIntro: {
    paddingHorizontal: 2,
    marginBottom: 12,
  },
  panelTitle: {
    color: auth.text,
    fontSize: 17,
    fontWeight: "800",
  },
  panelCopy: {
    marginTop: 4,
    color: auth.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  featureStack: {
    gap: 9,
  },
  featureCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    backgroundColor: auth.panelRaised,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: auth.border,
  },
  featureIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
  },
  featureTitle: {
    color: auth.text,
    fontSize: 12.5,
    fontWeight: "800",
  },
  featureDescription: {
    marginTop: 2,
    color: auth.muted,
    fontSize: 9.8,
    lineHeight: 14,
  },
  actions: {
    gap: 9,
  },
  actionPressable: {
    borderRadius: 14,
  },
  primaryAction: {
    minHeight: 62,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: auth.cyan,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: redesign.control.largeHeight,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: auth.panel,
    borderWidth: 1,
    borderColor: auth.border,
  },
  secondaryButtonText: {
    color: auth.text,
    fontSize: 13.5,
    fontWeight: "800",
  },
  secureReturnCard: {
    gap: 12,
    borderRadius: theme.radius.xl,
    padding: 16,
    backgroundColor: auth.panel,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: auth.border,
    ...theme.shadows.sm,
  },
  secureReturnHeading: {
    gap: 4,
  },
  secureReturnBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  secureReturnBadgeText: {
    color: auth.success,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  secureReturnTitle: {
    color: auth.text,
    fontSize: 17,
    fontWeight: "900",
  },
  biometricButton: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 10,
    borderRadius: 15,
    backgroundColor: auth.panelRaised,
    borderWidth: 1,
    borderColor: auth.borderStrong,
  },
  biometricIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: auth.cyanSoft,
  },
  biometricCopy: {
    flex: 1,
    minWidth: 0,
  },
  biometricTitle: {
    color: auth.text,
    fontSize: 12.5,
    fontWeight: "800",
  },
  biometricHint: {
    marginTop: 2,
    color: auth.muted,
    fontSize: 9.5,
    lineHeight: 13.5,
  },
  errorBox: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: "rgba(251, 113, 133, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
  },
  errorText: {
    flex: 1,
    color: auth.danger,
    fontSize: 10,
    lineHeight: 14,
  },
  otpFallback: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  otpFallbackText: {
    color: auth.text,
    fontSize: 11,
    fontWeight: "700",
  },
  languageRow: {
    alignSelf: "center",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  languageText: {
    color: auth.subtle,
    fontSize: 10.5,
    fontWeight: "700",
  },
  languageDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: redesign.visual.pressedScale }],
  },
  });
}
