import React, { useMemo } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import { redesign } from "@/design/redesign";
import { radius } from "@/design/tokens";
import { runtimeConfig } from "@/config/runtime";
import { brandConfig } from "@/config/brand";
import { appIdentity } from "@/config/appIdentity";

type Role = "customer" | "provider";

type Feature = { icon: string; title: string; description: string };

function externalDisplayValue(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function AboutScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr } = useLang();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version || appIdentity.version;
  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;

  const features = useMemo<Feature[]>(() => role === "provider" ? [
    { icon: "shield-check", title: tr("Verified marketplace"), description: tr("Provider and customer workflows include identity, booking, payment-evidence, and safety controls.") },
    { icon: "wallet", title: tr("Transparent earnings"), description: tr("Track completed work, commission, invoices, withdrawals, and Premium requests from the provider app.") },
    { icon: "message-circle", title: tr("Private communication"), description: tr("Use in-app chat, calls, notifications, and support tickets without publishing your personal phone number.") },
    { icon: "map-pin", title: tr("Pakistan-wide service areas"), description: tr("Manage availability, service radius, cities, and areas configured through the Athoo admin system.") },
  ] : [
    { icon: "shield-check", title: tr("Verified service providers"), description: tr("Athoo displays provider verification status and keeps private identity documents protected.") },
    { icon: "badge-dollar-sign", title: tr("Clear pricing workflows"), description: tr("Review offers, visit charges, negotiations, invoices, and refund requests before taking action.") },
    { icon: "message-circle", title: tr("Private communication"), description: tr("Use in-app chat, calls, notifications, and support tickets without publishing your personal phone number.") },
    { icon: "map-pin", title: tr("Services across Pakistan"), description: tr("Discover services through admin-managed categories, cities, areas, provider availability, and live booking locations.") },
  ], [role, tr]);

  const openExternal = async (url: string, label: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("unsupported");
      await Linking.openURL(url);
    } catch {
      Alert.alert(tr("Unable to open link"), tr("We couldn't open {{label}} on this device. Please try again later.", { label }));
    }
  };

  const supportPhone = settings.supportPhone || runtimeConfig.support.phoneDisplay || "";
  const supportEmail = settings.supportEmail || runtimeConfig.support.email || "";

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title={tr("About {{name}}", { name: brandConfig.displayName })} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        <View style={[styles.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.logoWrap, { backgroundColor: theme.colors.white }]}>
            <Image source={brandConfig.assets.mark} style={styles.logo} resizeMode="contain" accessibilityLabel="Athoo logo" />
          </View>
          <AppText variant="h1" align="center">{settings.platformName || brandConfig.displayName}</AppText>
          <AppText tone="secondary" align="center" style={styles.tagline}>
            {role === "provider"
              ? tr("A professional marketplace for service providers across Pakistan.")
              : tr("Professional home and local services across Pakistan.")}
          </AppText>
          <View style={[styles.versionPill, { backgroundColor: theme.colors.surfaceAlt }]}>
            <AppText variant="caption" tone="secondary">{tr("App version {{version}}", { version })}</AppText>
          </View>
        </View>

        <AppCard elevated={false}>
          <AppText variant="h3">{tr("Our mission")}</AppText>
          <AppText tone="secondary" style={styles.missionCopy}>
            {tr("Athoo connects customers and skilled service providers through structured bookings, transparent communication, privacy controls, and accountable admin operations.")}
          </AppText>
        </AppCard>

        <View style={styles.sectionHeader}>
          <AppText variant="h3">{role === "provider" ? tr("Provider experience") : tr("Customer experience")}</AppText>
        </View>

        {features.map((feature) => (
          <AppCard key={feature.title} elevated={false}>
            <View style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: theme.colors.infoSoft }]}>
                <Icon name={feature.icon as any} size={21} color={accent} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{feature.title}</AppText>
                <AppText variant="caption" tone="secondary" style={styles.featureCopy}>{feature.description}</AppText>
              </View>
            </View>
          </AppCard>
        ))}

        <AppCard elevated={false}>
          <AppText variant="h3">{tr("Contact Athoo")}</AppText>
          <View style={styles.contactList}>
            {runtimeConfig.support.whatsappUrl ? (
              <ContactRow
                icon="message-circle"
                iconColor={theme.colors.success}
                label={tr("WhatsApp support")}
                value={supportPhone}
                onPress={() => void openExternal(runtimeConfig.support.whatsappUrl!, tr("WhatsApp"))}
              />
            ) : null}
            <ContactRow
              icon="mail"
              iconColor={theme.colors.primary}
              label={tr("Support email")}
              value={supportEmail}
              onPress={() => void openExternal(`mailto:${supportEmail}`, tr("email"))}
            />
            {runtimeConfig.support.instagramUrl ? (
              <ContactRow
                icon="instagram"
                iconColor={theme.colors.accent}
                label="Instagram"
                value={externalDisplayValue(runtimeConfig.support.instagramUrl)}
                onPress={() => void openExternal(runtimeConfig.support.instagramUrl!, "Instagram")}
              />
            ) : null}
            {runtimeConfig.support.facebookUrl ? (
              <ContactRow
                icon="facebook"
                iconColor={theme.colors.info}
                label="Facebook"
                value={externalDisplayValue(runtimeConfig.support.facebookUrl)}
                onPress={() => void openExternal(runtimeConfig.support.facebookUrl!, "Facebook")}
              />
            ) : null}
          </View>
        </AppCard>

        <AppText variant="caption" tone="muted" align="center" style={styles.legal}>
          {tr("© 2026 Athoo. All rights reserved. Built for Pakistan.")}
        </AppText>
      </ScrollView>
    </View>
  );
}

function ContactRow({ icon, iconColor, label, value, onPress }: { icon: string; iconColor: string; label: string; value: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactRow,
        { borderBottomColor: theme.colors.divider },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.contactIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon name={icon as any} size={19} color={iconColor} />
      </View>
      <View style={styles.flex}>
        <AppText variant="caption" tone="secondary">{label}</AppText>
        <AppText variant="label">{value}</AppText>
      </View>
      <Icon name="external-link" size={17} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: redesign.visual.pressedScale }],
  },
  content: {
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: redesign.layout.fieldGap,
    gap: redesign.layout.cardGap,
  },
  hero: {
    borderWidth: redesign.visual.cardBorderWidth,
    borderRadius: radius.lg,
    alignItems: "center",
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingVertical: redesign.layout.sectionGap,
    gap: 8,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    overflow: "hidden",
  },
  logo: {
    width: 80,
    height: 80,
  },
  tagline: {
    maxWidth: 540,
    lineHeight: 21,
  },
  versionPill: {
    minHeight: 28,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  missionCopy: {
    lineHeight: 22,
    marginTop: 8,
  },
  sectionHeader: {
    marginTop: 6,
    paddingHorizontal: 2,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: redesign.layout.cardGap,
  },
  featureIcon: {
    width: redesign.control.compactHeight,
    height: redesign.control.compactHeight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  featureCopy: {
    lineHeight: 19,
    marginTop: 4,
  },
  contactList: {
    marginTop: 8,
  },
  contactRow: {
    minHeight: redesign.control.largeHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: redesign.layout.cardGap,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  legal: {
    lineHeight: 18,
    marginVertical: 8,
  },
});
