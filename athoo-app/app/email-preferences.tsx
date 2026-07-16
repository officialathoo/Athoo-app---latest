import { Icon } from "@/components/ui/Icon";
import { brandConfig } from "@/config/brand";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Preferences = {
  bookingUpdates: boolean;
  accountUpdates: boolean;
  productUpdates: boolean;
  marketingEmails: boolean;
};

const DEFAULTS: Preferences = {
  bookingUpdates: true,
  accountUpdates: true,
  productUpdates: false,
  marketingEmails: false,
};

export default function EmailPreferencesScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { translate: tr, textAlign, writingDirection, direction } = useLang();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = useMemo(() => ({ textAlign, writingDirection }), [textAlign, writingDirection]);
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof Preferences | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getEmailPreferences();
      setPreferences({ ...DEFAULTS, ...response.preferences });
    } catch (error) {
      Alert.alert(tr("Could not load settings"), tr(apiErrorToMessage(error, "Please try again.")));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: keyof Preferences, value: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingKey(key);
    try {
      const response = await api.updateEmailPreferences({ [key]: value });
      setPreferences({ ...DEFAULTS, ...response.preferences });
    } catch (error) {
      setPreferences(previous);
      Alert.alert(tr("Could not save setting"), tr(apiErrorToMessage(error, "Please try again.")));
    } finally {
      setSavingKey(null);
    }
  };

  const rows: Array<{ key: keyof Preferences; icon: string; title: string; description: string }> = [
    { key: "bookingUpdates", icon: "calendar", title: tr("Booking updates"), description: tr("Confirmations, provider updates, completion and invoice messages.") },
    { key: "accountUpdates", icon: "shield", title: tr("Account updates"), description: tr("Important account and service notices. Security alerts are always enabled.") },
    { key: "productUpdates", icon: "sparkles", title: tr("Product updates"), description: tr("New {{brand}} features and service announcements.", { brand: brandConfig.displayName }) },
    { key: "marketingEmails", icon: "gift", title: tr("Offers and promotions"), description: tr("Optional special offers. You can unsubscribe at any time.") },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 }]}>
      <View style={[styles.header, direction === "rtl" && styles.rowReverse]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}><Icon name="arrow-left" size={20} color={theme.colors.text} /></Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, localizedText]}>{tr("Email & communication")}</Text>
          <Text style={[styles.subtitle, localizedText]}>{tr("Choose which non-security emails {{brand}} may send you.", { brand: brandConfig.displayName })}</Text>
        </View>
      </View>

      <View style={styles.verificationCard}>
        <View style={styles.verificationIcon}><Icon name={user?.emailVerified ? "check-circle" : "alert-circle"} size={22} color={user?.emailVerified ? theme.colors.success : theme.colors.warning} /></View>
        <View style={styles.verificationText}>
          <Text style={[styles.cardTitle, localizedText]}>{user?.emailVerified ? tr("Email verified") : tr("Email verification required")}</Text>
          <Text style={[styles.cardDescription, localizedText]}>{user?.email || tr("No email address added")}</Text>
        </View>
        {!user?.emailVerified && user?.email ? (
          <Pressable style={styles.verifyButton} onPress={() => router.push({ pathname: "/auth/email-verification" as any, params: { role: user.role } })}>
            <Text style={styles.verifyText}>{tr("Verify")}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.listCard}>
        {rows.map((row, index) => (
          <View key={row.key} style={[styles.row, index < rows.length - 1 && styles.rowBorder, direction === "rtl" && styles.rowReverse]}>
            <View style={styles.rowIcon}><Icon name={row.icon as any} size={19} color={theme.colors.primary} /></View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, localizedText]}>{row.title}</Text>
              <Text style={[styles.rowDescription, localizedText]}>{row.description}</Text>
            </View>
            <Switch
              value={preferences[row.key]}
              onValueChange={(value) => void toggle(row.key, value)}
              disabled={loading || savingKey === row.key}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + "55" }}
              thumbColor={preferences[row.key] ? theme.colors.primary : theme.colors.textMuted}
            />
          </View>
        ))}
      </View>

      <View style={styles.noteCard}>
        <Icon name="lock" size={17} color={theme.colors.info} />
        <Text style={[styles.noteText, localizedText]}>{tr("OTP codes, password changes, suspicious sign-ins and critical account notices cannot be disabled for your safety.")}</Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 18, gap: 18 },
  rowReverse: { flexDirection: "row-reverse" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  headerText: { flex: 1, gap: 3 },
  title: { fontSize: 23, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  verificationCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  verificationIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  verificationText: { flex: 1, gap: 3 },
  cardTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  cardDescription: { color: theme.colors.textSecondary, fontSize: 12 },
  verifyButton: { borderRadius: 10, backgroundColor: theme.colors.primary + "18", paddingHorizontal: 12, paddingVertical: 8 },
  verifyText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
  listCard: { borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.primary + "12", alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  rowDescription: { color: theme.colors.textSecondary, fontSize: 11, lineHeight: 16 },
  noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, backgroundColor: theme.colors.info + "12", borderWidth: 1, borderColor: theme.colors.info + "30" },
  noteText: { flex: 1, color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
