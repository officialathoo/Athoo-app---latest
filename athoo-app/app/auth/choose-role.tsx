import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, {
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
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

const createAuthPalette = (theme: AthooTheme) => ({
  background: theme.colors.background,
  backgroundDeep: theme.colors.surfaceAlt,
  panel: theme.colors.surface,
  panelRaised: theme.colors.elevated,
  border: theme.colors.border,
  borderStrong: theme.colors.border,
  text: theme.colors.text,
  muted: theme.colors.textSecondary,
  subtle: theme.colors.textMuted,
  cyan: theme.colors.primary,
  cyanSoft: theme.colors.infoSoft,
  orange: theme.colors.secondary,
  orangeSoft: theme.colors.premiumSoft,
  success: theme.colors.success,
});

export default function ChooseRoleScreen() {
  const insets = useSafeAreaInsets();
  const params =
    useLocalSearchParams<{ mode?: string }>();
  const mode =
    params.mode === "signup"
      ? "signup"
      : "signin";
  const { translate: tr } = useLang();
  const { theme } = useTheme();
  const auth = useMemo(() => createAuthPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme, auth), [auth, theme]);

  const intro =
    useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const roles = useMemo(
    () => [
      {
        role: "customer" as const,
        icon: "user",
        title: tr("Customer"),
        eyebrow: tr("BOOK SERVICES"),
        description: tr(
          "Find trusted professionals, manage bookings, chats, invoices and refunds.",
        ),
        color: auth.cyan,
        background: auth.cyanSoft,
      },
      {
        role: "provider" as const,
        icon: "briefcase",
        title: tr("Service Provider"),
        eyebrow: tr("GROW YOUR WORK"),
        description: tr(
          "Receive jobs, negotiate, manage verification, availability and earnings.",
        ),
        color: auth.orange,
        background: auth.orangeSoft,
      },
    ],
    [tr],
  );

  const continueAs = (
    role: "customer" | "provider",
  ) => {
    if (mode === "signin") {
      router.push(
        `/auth/login?role=${role}` as never,
      );
      return;
    }

    router.push(
      (role === "provider"
        ? "/auth/provider-register"
        : "/auth/register?role=customer") as never,
    );
  };

  const introStyle = {
    opacity: intro,
    transform: [
      {
        translateY: intro.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={
          theme.dark
            ? ["#07101F", auth.background, auth.backgroundDeep]
            : [theme.colors.infoSoft, auth.background, auth.backgroundDeep]
        }
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.88, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={styles.topGlow}
      />
      <View
        pointerEvents="none"
        style={styles.orangeGlow}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:
              (Platform.OS === "web"
                ? 34
                : insets.top) + 14,
            paddingBottom:
              insets.bottom + 20,
          },
        ]}
      >
        <Animated.View
          style={[styles.inner, introStyle]}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("Back")}
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="arrow-left"
                size={18}
                color={auth.text}
              />
            </Pressable>

            <View style={styles.modeBadge}>
              <Icon
                name={
                  mode === "signin"
                    ? "log-in"
                    : "user-plus"
                }
                size={13}
                color={
                  mode === "signin"
                    ? auth.cyan
                    : auth.orange
                }
              />
              <Text style={styles.modeBadgeText}>
                {mode === "signin"
                  ? tr("SIGN IN")
                  : tr("NEW ACCOUNT")}
              </Text>
            </View>

            <View style={styles.topSpacer} />
          </View>

          <View style={styles.brandBlock}>
            <View style={styles.logoHalo}>
              <View style={styles.logoShell}>
                <Image
                  source={brandConfig.assets.mark}
                  style={styles.logo}
                  resizeMode="cover"
                  accessibilityLabel="Athoo logo"
                />
              </View>
            </View>

            <Text style={styles.brandLabel}>
              {brandConfig.displayName}
            </Text>

            <Text style={styles.title}>
              {mode === "signin"
                ? tr("How do you use Athoo?")
                : tr("Choose your account type")}
            </Text>

            <Text style={styles.subtitle}>
              {mode === "signin"
                ? tr(
                    "Select your role to open the correct secure sign-in flow.",
                  )
                : tr(
                    "Choose how you will use Athoo. Your role controls the right onboarding and verification steps.",
                  )}
            </Text>
          </View>

          <View style={styles.rolePanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelLabel}>
                {tr("SELECT ONE OPTION")}
              </Text>
              <View style={styles.secureMini}>
                <Icon
                  name="shield-check"
                  size={12}
                  color={auth.success}
                />
                <Text
                  style={styles.secureMiniText}
                >
                  {tr("Secure")}
                </Text>
              </View>
            </View>

            <View style={styles.roleStack}>
              {roles.map((item) => (
                <Pressable
                  key={item.role}
                  testID={`auth-${mode}-${item.role}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.description}`}
                  onPress={() =>
                    continueAs(item.role)
                  }
                  style={({ pressed }) => [
                    styles.roleCard,
                    pressed &&
                      styles.roleCardPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.roleIcon,
                      {
                        backgroundColor:
                          item.background,
                        borderColor:
                          item.color + "35",
                      },
                    ]}
                  >
                    <Icon
                      name={item.icon}
                      size={23}
                      color={item.color}
                    />
                  </View>

                  <View style={styles.roleCopy}>
                    <Text
                      style={[
                        styles.roleEyebrow,
                        { color: item.color },
                      ]}
                    >
                      {item.eyebrow}
                    </Text>
                    <Text style={styles.roleTitle}>
                      {item.title}
                    </Text>
                    <Text
                      style={styles.roleDescription}
                      numberOfLines={3}
                    >
                      {item.description}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.chevron,
                      {
                        backgroundColor:
                          item.background,
                      },
                    ]}
                  >
                    <Icon
                      name="chevron-right"
                      size={17}
                      color={item.color}
                    />
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.securityNote}>
              <View
                style={styles.securityNoteIcon}
              >
                <Icon
                  name="lock"
                  size={13}
                  color={auth.cyan}
                />
              </View>
              <Text style={styles.securityNoteText}>
                {tr(
                  "Your role only selects the correct Athoo flow. Account security and verification rules stay unchanged.",
                )}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                `/auth/choose-role?mode=${
                  mode === "signin"
                    ? "signup"
                    : "signin"
                }` as never,
              )
            }
            style={({ pressed }) => [
              styles.switchMode,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.switchModeMuted}>
              {mode === "signin"
                ? tr("New to Athoo?")
                : tr("Already registered?")}
            </Text>
            <Text style={styles.switchModeStrong}>
              {mode === "signin"
                ? tr("Create an account")
                : tr("Sign in")}
            </Text>
            <Icon
              name="arrow-right"
              size={14}
              color={auth.cyan}
            />
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AthooTheme, auth: ReturnType<typeof createAuthPalette>) {
  return StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  topGlow: {
    position: "absolute",
    top: -155,
    alignSelf: "center",
    width: 430,
    height: 320,
    borderRadius: 220,
    backgroundColor:
      "rgba(37, 183, 232, 0.18)",
  },
  orangeGlow: {
    position: "absolute",
    left: -110,
    bottom: 60,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor:
      "rgba(249, 115, 22, 0.08)",
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: redesign.layout.maxContentWidth,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: redesign.layout.horizontalPadding,
  },
  inner: {
    width: "100%",
    gap: 17,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: auth.border,
  },
  modeBadge: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor:
      "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: auth.border,
  },
  modeBadgeText: {
    color: auth.text,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  topSpacer: {
    width: 40,
  },
  brandBlock: {
    alignItems: "center",
    paddingHorizontal: 6,
  },
  logoHalo: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(37, 183, 232, 0.10)",
    borderWidth: 1,
    borderColor: auth.borderStrong,
    shadowColor: auth.cyan,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoShell: {
    width: 60,
    height: 60,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  logo: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },
  brandLabel: {
    marginTop: 8,
    color: auth.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    ...theme.typography.h1,
    color: auth.text,
    letterSpacing: -0.45,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 7,
    maxWidth: 420,
    ...theme.typography.body,
    color: auth.muted,
    textAlign: "center",
  },
  rolePanel: {
    borderRadius: theme.radius.xl,
    padding: 16,
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: auth.borderStrong,
    ...theme.shadows.md,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 1,
  },
  panelLabel: {
    color: auth.subtle,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  secureMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  secureMiniText: {
    color: auth.success,
    fontSize: 9,
    fontWeight: "800",
  },
  roleStack: {
    gap: 9,
  },
  roleCard: {
    minHeight: 100,
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
  roleCardPressed: {
    opacity: 0.88,
    transform: [{ scale: redesign.visual.pressedScale }],
  },
  roleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  roleCopy: {
    flex: 1,
    minWidth: 0,
  },
  roleEyebrow: {
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  roleTitle: {
    marginTop: 2,
    color: auth.text,
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "900",
  },
  roleDescription: {
    marginTop: 3,
    color: auth.muted,
    fontSize: 9.8,
    lineHeight: 14,
  },
  chevron: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  securityNote: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor:
      "rgba(37, 183, 232, 0.07)",
    borderWidth: 1,
    borderColor:
      "rgba(37, 183, 232, 0.14)",
  },
  securityNoteIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: auth.cyanSoft,
  },
  securityNoteText: {
    flex: 1,
    color: auth.muted,
    fontSize: 9.5,
    lineHeight: 14,
  },
  switchMode: {
    minHeight: redesign.control.compactHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  switchModeMuted: {
    color: auth.muted,
    fontSize: 11,
  },
  switchModeStrong: {
    color: auth.text,
    fontSize: 11,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: redesign.visual.pressedScale }],
  },
  });
}
