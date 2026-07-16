import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

type Role = "customer" | "provider";

type PrivacyItem = { icon: string; title: string; description: string; tone: "primary" | "success" | "warning" | "accent" | "danger" };

export function PrivacySecurityScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr } = useLang();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const group = role === "provider" ? "(provider)" : "(customer)";

  const items = useMemo<PrivacyItem[]>(() => [
    {
      icon: "phone-off",
      title: tr("Phone number protection"),
      description: tr("Athoo keeps personal phone numbers out of public profiles and uses in-app communication for service conversations."),
      tone: "success",
    },
    {
      icon: role === "provider" ? "file-lock-2" : "shield-check",
      title: role === "provider" ? tr("Document protection") : tr("Verified provider information"),
      description: role === "provider"
        ? tr("Identity and verification documents are private and are used only for verification, safety, and lawful platform operations.")
        : tr("Customers see verification status, not a provider's private identity documents."),
      tone: "primary",
    },
    {
      icon: "map-pin",
      title: tr("Location controls"),
      description: tr("Precise location is used only when needed for service discovery, booking, arrival, and active-job safety features."),
      tone: "accent",
    },
    {
      icon: "database",
      title: tr("Responsible data handling"),
      description: tr("Athoo limits data access to authorized operations and does not display storage, database, or internal system details to other users."),
      tone: "warning",
    },
    {
      icon: "user-cog",
      title: tr("Account controls"),
      description: tr("You can update your password, review policies, contact support, or request permanent account deletion from the app."),
      tone: "danger",
    },
  ], [role, tr]);

  const toneColor = (tone: PrivacyItem["tone"]) => ({
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
  })[tone];

  const toneBackground = (tone: PrivacyItem["tone"]) => ({
    primary: theme.colors.infoSoft,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
    accent: theme.colors.surfaceAlt,
    danger: theme.colors.dangerSoft,
  })[tone];

  const deleteAccount = () => {
    Alert.alert(
      tr("Request account deletion"),
      tr("Your account and eligible personal data will be permanently deleted. Records that Athoo must retain for legal, safety, fraud-prevention, or financial-audit reasons may be kept only for the required period."),
      [
        { text: tr("Cancel"), style: "cancel" },
        {
          text: tr("Delete account"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              tr("Final confirmation"),
              tr("This action cannot be undone. Do you want to continue?"),
              [
                { text: tr("Keep my account"), style: "cancel" },
                {
                  text: tr("Delete permanently"),
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await api.deleteMe();
                      await logout();
                    } catch (caught) {
                      Alert.alert(
                        tr("Unable to delete account"),
                        tr(apiErrorToMessage(caught, "We couldn't process your deletion request. Please try again or contact support.")),
                      );
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title={tr("Privacy & security")} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        <AppCard elevated={false} style={{ backgroundColor: theme.colors.infoSoft }}>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon name="shield" size={30} color={theme.colors.primary} />
            </View>
            <AppText variant="h2" align="center">{tr("Your privacy is part of the product")}</AppText>
            <AppText tone="secondary" align="center" style={styles.heroCopy}>
              {tr("Athoo uses privacy controls across profiles, bookings, chat, location, documents, payments, and support workflows.")}
            </AppText>
          </View>
        </AppCard>

        {items.map((item) => {
          const color = toneColor(item.tone);
          return (
            <AppCard key={item.title} elevated={false}>
              <View style={styles.itemRow}>
                <View style={[styles.itemIcon, { backgroundColor: toneBackground(item.tone) }]}>
                  <Icon name={item.icon as any} size={21} color={color} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{item.title}</AppText>
                  <AppText variant="caption" tone="secondary" style={styles.itemDescription}>{item.description}</AppText>
                </View>
              </View>
            </AppCard>
          );
        })}

        <AppCard elevated={false}>
          <AppText variant="h3">{tr("Security and policy controls")}</AppText>
          <View style={styles.links}>
            <PolicyLink icon="lock" label={tr("Change password")} onPress={() => router.push(`/${group}/change-password` as any)} />
            <PolicyLink icon="book-open-check" label={tr("Policy center")} onPress={() => router.push("/legal" as any)} />
            <PolicyLink icon="file-text" label={tr("Privacy policy")} onPress={() => router.push("/legal/privacy" as any)} />
            <PolicyLink icon="clipboard-list" label={tr("Terms of service")} onPress={() => router.push("/legal/terms" as any)} />
            <PolicyLink icon="headphones" label={tr("Contact support")} onPress={() => router.push(`/${group}/contact-support` as any)} />
          </View>
        </AppCard>

        <AppCard elevated={false} style={{ backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger }}>
          <View style={styles.dangerHeader}>
            <Icon name="alert-triangle" size={20} color={theme.colors.danger} />
            <AppText variant="bodyStrong" tone="danger">{tr("Danger zone")}</AppText>
          </View>
          <AppText variant="caption" tone="danger" style={styles.dangerCopy}>
            {tr("Account deletion is permanent. Download or save anything you need before continuing.")}
          </AppText>
          <Button
            title={deleting ? tr("Deleting account…") : tr("Request account deletion")}
            onPress={deleteAccount}
            loading={deleting}
            variant="danger"
            fullWidth
            style={{ marginTop: 14 }}
          />
        </AppCard>
      </ScrollView>
    </View>
  );
}

function PolicyLink({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkRow,
        { borderBottomColor: theme.colors.divider },
        pressed && { opacity: 0.68 },
      ]}
    >
      <View style={[styles.linkIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Icon name={icon as any} size={18} color={theme.colors.primary} />
      </View>
      <AppText variant="label" style={styles.flex}>{label}</AppText>
      <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  hero: { alignItems: "center", gap: 9, paddingVertical: 4 },
  heroIcon: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  heroCopy: { maxWidth: 560, lineHeight: 21 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 13 },
  itemIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  itemDescription: { lineHeight: 19, marginTop: 4 },
  links: { marginTop: 8 },
  linkRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  linkIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  dangerHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  dangerCopy: { lineHeight: 19, marginTop: 7 },
});
