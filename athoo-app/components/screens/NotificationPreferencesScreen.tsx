import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import {
  notificationPolicies,
  type NotificationCategory,
} from "@/config/notifications";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";
import type { AthooTheme } from "@/design/theme";
import {
  notificationService,
  type NotificationDiagnostics,
} from "@/services/NotificationService";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PreferenceRow = {
  key: string;
  icon: string;
  title: string;
  description: string;
  category?: NotificationCategory;
  safety: "critical" | "transactional" | "optional";
  action?: "email";
};

function readableSound(sound: string) {
  return sound
    .replace(/\.(wav|mp3|caf)$/i, "")
    .replace(/^athoo_/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function NotificationPreferencesScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection } = useLang();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);

  const isProvider = user?.role === "provider";
  const accent = isProvider ? theme.colors.secondary : theme.colors.primary;
  const accentSoft = isProvider ? theme.colors.premiumSoft : theme.colors.infoSoft;
  const accentText = isProvider ? theme.colors.onLight : theme.colors.onBrand;
  const localizedText = { textAlign, writingDirection } as const;

  const loadDiagnostics = useCallback(async () => {
    setChecking(true);
    try {
      setDiagnostics(await notificationService.getDiagnostics());
    } finally {
      setChecking(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDiagnostics();
    }, [loadDiagnostics]),
  );

  const openSystemNotificationSettings = async () => {
    if (openingSettings) return;
    setOpeningSettings(true);
    try {
      if (Platform.OS === "android") {
        const packageName = Constants.expoConfig?.android?.package;
        if (packageName) {
          try {
            await Linking.sendIntent(
              "android.settings.APP_NOTIFICATION_SETTINGS",
              [{ key: "android.provider.extra.APP_PACKAGE", value: packageName }],
            );
            return;
          } catch {
            // Fall through to Athoo app settings.
          }
        }
      }
      await Linking.openSettings();
    } catch {
      Alert.alert(
        tr("Unable to open settings"),
        tr("Open your phone Settings, choose Athoo, then open Notifications."),
      );
    } finally {
      setOpeningSettings(false);
    }
  };

  const rows: PreferenceRow[] = [
    {
      key: "jobs",
      icon: "briefcase",
      title: tr("Jobs & Booking"),
      description: tr("New jobs, booking confirmations, status changes and negotiation alerts."),
      category: "job",
      safety: "critical",
    },
    {
      key: "chat",
      icon: "message-circle",
      title: tr("Chat Messages"),
      description: tr("New customer or provider messages and conversation updates."),
      category: "message",
      safety: "transactional",
    },
    {
      key: "calls",
      icon: "phone-call",
      title: tr("Calls"),
      description: tr("Incoming Athoo voice-call alerts."),
      category: "call",
      safety: "critical",
    },
    {
      key: "payments",
      icon: "credit-card",
      title: tr("Payments, Invoices & Refunds"),
      description: tr("Invoice, refund, withdrawal and payment-related updates."),
      category: "general",
      safety: "transactional",
    },
    {
      key: "security",
      icon: "shield",
      title: tr("Account & Security"),
      description: tr("Important account, verification and security notices."),
      category: "general",
      safety: "critical",
    },
    {
      key: "offers",
      icon: "gift",
      title: tr("Offers & Promotions"),
      description: tr("Optional promotional email and communication preferences."),
      safety: "optional",
      action: "email",
    },
  ];

  const permissionLabel = diagnostics?.expoGo
    ? tr("Expo Go - native push unavailable")
    : diagnostics?.permissionGranted
    ? tr("Push access enabled")
    : tr("Push access needs attention");

  const permissionColor = diagnostics?.permissionGranted
    ? theme.colors.success
    : diagnostics?.expoGo
    ? theme.colors.warning
    : theme.colors.danger;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Go back")}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={[styles.title, localizedText]}>{tr("Notification Preferences")}</Text>
          <Text style={[styles.subtitle, localizedText]}>
            {tr("Control phone-level push, sound and vibration without risking critical Athoo alerts.")}
          </Text>
        </View>
      </View>

      <AnimatedCard direction="fade" style={styles.statusMotion}>
        <View style={styles.statusCard}>
          <View style={[styles.statusIcon, { backgroundColor: permissionColor + "18" }]}>
            {checking ? (
              <ActivityIndicator size="small" color={permissionColor} />
            ) : (
              <Icon
                name={diagnostics?.permissionGranted ? "check-circle" : "bell"}
                size={23}
                color={permissionColor}
              />
            )}
          </View>
          <View style={styles.statusCopy}>
            <Text style={[styles.statusTitle, localizedText]}>{permissionLabel}</Text>
            <Text style={[styles.statusText, localizedText]}>
              {diagnostics?.permissionGranted
                ? tr("Athoo can receive native notifications on this device.")
                : tr("Use phone settings to allow notifications and configure sound or vibration.")}
            </Text>
          </View>
          <Pressable
            disabled={checking}
            onPress={() => void loadDiagnostics()}
            style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
          >
            <Icon name="refresh-cw" size={16} color={accent} />
          </Pressable>
        </View>
      </AnimatedCard>

      <Pressable
        accessibilityRole="button"
        disabled={openingSettings}
        onPress={() => void openSystemNotificationSettings()}
        style={({ pressed }) => [
          styles.systemButton,
          { backgroundColor: accent },
          openingSettings && styles.disabled,
          pressed && !openingSettings && styles.pressed,
        ]}
      >
        {openingSettings ? (
          <ActivityIndicator size="small" color={accentText} />
        ) : (
          <Icon name="settings" size={18} color={accentText} />
        )}
        <Text style={[styles.systemButtonText, { color: accentText }]}>
          {tr("Open Phone Notification Settings")}
        </Text>
      </Pressable>

      <View style={styles.explainerCard}>
        <Icon name="info" size={18} color={theme.colors.info} />
        <Text style={[styles.explainerText, localizedText]}>
          {Platform.OS === "android"
            ? tr("Android keeps Athoo alerts in separate system channels. Change push visibility, sound and vibration there; Athoo will not replace those controls with misleading in-app switches.")
            : tr("iPhone notification delivery, sound and alert presentation are controlled in iOS Settings. Athoo keeps critical transactional alerts available in the app inbox.")}
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, localizedText]}>{tr("Alert categories")}</Text>
        <Text style={[styles.sectionSubtitle, localizedText]}>
          {tr("What each category contains and where its phone controls live.")}
        </Text>
      </View>

      <View style={styles.categoryList}>
        {rows.map((row, index) => {
          const policy = row.category ? notificationPolicies[row.category] : null;
          const rowColor = row.safety === "critical"
            ? theme.colors.danger
            : row.safety === "transactional"
            ? accent
            : theme.colors.premium;
          const statusText = row.safety === "critical"
            ? tr("Critical")
            : row.safety === "transactional"
            ? tr("Transactional")
            : tr("Optional");

          return (
            <AnimatedCard
              key={row.key}
              delay={Math.min(index * 45, 220)}
              style={styles.categoryMotion}
            >
              <Pressable
                accessibilityRole={row.action ? "button" : undefined}
                disabled={!row.action}
                onPress={() => {
                  if (row.action === "email") {
                    router.push("/email-preferences" as any);
                  }
                }}
                style={({ pressed }) => [
                  styles.categoryCard,
                  pressed && row.action && styles.pressed,
                ]}
              >
                <View style={[styles.categoryIcon, { backgroundColor: rowColor + "16" }]}>
                  <Icon name={row.icon} size={19} color={rowColor} />
                </View>

                <View style={styles.categoryCopy}>
                  <View style={styles.categoryTop}>
                    <Text style={[styles.categoryTitle, localizedText]}>{row.title}</Text>
                    <View style={[styles.categoryStatus, { backgroundColor: rowColor + "14" }]}>
                      <Text style={[styles.categoryStatusText, { color: rowColor }]}>{statusText}</Text>
                    </View>
                  </View>

                  <Text style={[styles.categoryDescription, localizedText]}>{row.description}</Text>

                  {policy ? (
                    <View style={styles.policyRow}>
                      <View style={styles.policyItem}>
                        <Icon name="volume-2" size={12} color={theme.colors.textMuted} />
                        <Text style={styles.policyText}>{readableSound(policy.sound)}</Text>
                      </View>
                      <View style={styles.policyItem}>
                        <Icon name="bell" size={12} color={theme.colors.textMuted} />
                        <Text style={styles.policyText}>{policy.channelName}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.policyRow}>
                      <View style={styles.policyItem}>
                        <Icon name="mail" size={12} color={theme.colors.textMuted} />
                        <Text style={styles.policyText}>{tr("Manage in Email & communication")}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {row.action ? (
                  <Icon name="chevron-right" size={17} color={theme.colors.textMuted} />
                ) : null}
              </Pressable>
            </AnimatedCard>
          );
        })}
      </View>

      <View style={styles.safetyCard}>
        <View style={[styles.safetyIcon, { backgroundColor: accentSoft }]}>
          <Icon name="lock" size={18} color={accent} />
        </View>
        <View style={styles.safetyCopy}>
          <Text style={[styles.safetyTitle, localizedText]}>{tr("Critical alerts stay protected")}</Text>
          <Text style={[styles.safetyText, localizedText]}>
            {tr("OTP, password, suspicious sign-in, booking safety, call and other critical account notices are not given unsafe in-app off switches. Phone-level delivery can still be managed by you in system settings.")}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: {
      paddingHorizontal: redesign.layout.horizontalPadding,
      gap: redesign.layout.fieldGap,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: redesign.layout.cardGap,
    },
    backButton: {
      width: redesign.control.iconButtonSize,
      height: redesign.control.iconButtonSize,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    headerCopy: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 22,
      lineHeight: 27,
      fontWeight: "900",
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 3,
      fontSize: 11.5,
      lineHeight: 17,
      color: theme.colors.textSecondary,
    },
    statusMotion: { width: "100%" },
    statusCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: redesign.layout.cardGap,
      padding: redesign.layout.fieldGap,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    statusIcon: {
      width: redesign.control.compactHeight,
      height: redesign.control.compactHeight,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    statusCopy: { flex: 1, minWidth: 0 },
    statusTitle: {
      fontSize: 14,
      fontWeight: "900",
      color: theme.colors.text,
    },
    statusText: {
      marginTop: 3,
      fontSize: 10.5,
      lineHeight: 15,
      color: theme.colors.textSecondary,
    },
    refreshButton: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
    },
    systemButton: {
      minHeight: redesign.control.standardHeight,
      borderRadius: radius.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: redesign.layout.fieldGap,
    },
    systemButtonText: { fontSize: 13, fontWeight: "900" },
    disabled: { opacity: redesign.visual.disabledOpacity },
    pressed: {
      opacity: 0.82,
      transform: [{ scale: redesign.visual.pressedScale }],
    },
    explainerCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: redesign.layout.fieldGap,
      borderRadius: radius.md,
      backgroundColor: theme.colors.infoSoft,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.focusRing,
    },
    explainerText: {
      flex: 1,
      fontSize: 10.5,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    sectionHeader: { marginTop: 2, gap: 3 },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "900",
      color: theme.colors.text,
    },
    sectionSubtitle: {
      fontSize: 10.5,
      lineHeight: 15,
      color: theme.colors.textMuted,
    },
    categoryList: { gap: redesign.layout.cardGap },
    categoryMotion: { width: "100%" },
    categoryCard: {
      minHeight: 102,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: redesign.layout.cardGap,
      padding: redesign.layout.fieldGap,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    categoryIcon: {
      width: redesign.control.compactHeight,
      height: redesign.control.compactHeight,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    categoryCopy: { flex: 1, minWidth: 0 },
    categoryTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    categoryTitle: {
      flex: 1,
      fontSize: 13.5,
      lineHeight: 18,
      fontWeight: "800",
      color: theme.colors.text,
    },
    categoryStatus: {
      minHeight: 22,
      paddingHorizontal: 8,
      borderRadius: radius.pill,
      justifyContent: "center",
    },
    categoryStatusText: {
      fontSize: 8.5,
      fontWeight: "900",
    },
    categoryDescription: {
      marginTop: 4,
      fontSize: 10.5,
      lineHeight: 15,
      color: theme.colors.textSecondary,
    },
    policyRow: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    policyItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      maxWidth: "100%",
    },
    policyText: {
      flexShrink: 1,
      fontSize: 9,
      lineHeight: 13,
      fontWeight: "700",
      color: theme.colors.textMuted,
    },
    safetyCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: redesign.layout.cardGap,
      padding: redesign.layout.fieldGap,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: redesign.visual.cardBorderWidth,
      borderColor: theme.colors.border,
    },
    safetyIcon: {
      width: redesign.control.compactHeight,
      height: redesign.control.compactHeight,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    safetyCopy: { flex: 1, minWidth: 0 },
    safetyTitle: {
      fontSize: 13,
      fontWeight: "900",
      color: theme.colors.text,
    },
    safetyText: {
      marginTop: 4,
      fontSize: 10.5,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
  });
}