import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/services/api";
import { apiErrorToMessage } from "@/lib/apiError";

type Role = "customer" | "provider";

type Faq = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  sortOrder?: number;
};

function FaqCard({ faq, open, onToggle }: { faq: Faq; open: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  const { translate: tr } = useLang();
  return (
    <AppCard
      onPress={onToggle}
      elevated={false}
      style={[styles.faqCard, open && { borderColor: theme.colors.primary }]}
      testID={`faq-${faq.id}`}
    >
      <View style={styles.faqQuestionRow}>
        <View style={[styles.faqIcon, { backgroundColor: theme.colors.infoSoft }]}>
          <Icon name="help-circle" size={17} color={theme.colors.primary} />
        </View>
        <AppText variant="bodyStrong" style={styles.flex}>{faq.question}</AppText>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textMuted} />
      </View>
      {open ? (
        <View style={[styles.answerWrap, { borderTopColor: theme.colors.divider }]}>
          <AppText tone="secondary" style={styles.answer}>{faq.answer}</AppText>
          <AppText variant="caption" tone="muted">{tr("Tap again to collapse")}</AppText>
        </View>
      ) : null}
    </AppCard>
  );
}

export function HelpScreen({ role }: { role: Role }) {
  const { theme } = useTheme();
  const { translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const cacheKey = `athoo.admin.faqs.${role}.cache.v2`;
  const group = role === "provider" ? "(provider)" : "(customer)";
  const accent = role === "provider" ? theme.colors.secondary : theme.colors.primary;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cachedRaw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached)) setFaqs(cached);
      }

      const response = await api.getFaqs(role);
      const next = Array.isArray(response.faqs)
        ? [...response.faqs].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        : [];
      setFaqs(next);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(next)).catch(() => undefined);
    } catch (caught) {
      setError(tr(apiErrorToMessage(caught, "We couldn't refresh help articles. Please try again.")));
    } finally {
      setLoading(false);
    }
  }, [cacheKey, role, tr]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader
        title={tr("Help & FAQs")}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Contact support")}
            onPress={() => router.push(`/${group}/contact-support` as any)}
            style={({ pressed }) => [styles.headerIcon, { backgroundColor: theme.colors.infoSoft }, pressed && { opacity: 0.7 }]}
          >
            <Icon name="headphones" size={20} color={accent} />
          </Pressable>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        <AppCard elevated={false} style={{ backgroundColor: role === "provider" ? theme.colors.warningSoft : theme.colors.infoSoft }}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon name="life-buoy" size={26} color={accent} />
            </View>
            <View style={styles.flex}>
              <AppText variant="h2">{role === "provider" ? tr("Provider support centre") : tr("How can we help?")}</AppText>
              <AppText tone="secondary" style={styles.heroCopy}>
                {role === "provider"
                  ? tr("Find answers about jobs, earnings, commission, verification, and your provider account.")
                  : tr("Find answers about bookings, providers, payments, refunds, and your customer account.")}
              </AppText>
            </View>
          </View>
          <View style={styles.heroActions}>
            <Button title={tr("Contact support")} onPress={() => router.push(`/${group}/contact-support` as any)} style={styles.flexButton} />
            <Button title={tr("My tickets")} onPress={() => router.push(`/${group}/support-tickets` as any)} variant="outline" style={styles.flexButton} />
          </View>
        </AppCard>

        <View style={styles.sectionHeading}>
          <AppText variant="h3">{tr("Frequently asked questions")}</AppText>
          {!loading ? <AppText variant="caption" tone="muted">{tr("{{count}} article(s)", { count: faqs.length })}</AppText> : null}
        </View>

        {loading && faqs.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={accent} />
            <AppText tone="secondary">{tr("Loading help articles…")}</AppText>
          </View>
        ) : error && faqs.length === 0 ? (
          <AppCard elevated={false} style={{ backgroundColor: theme.colors.dangerSoft }}>
            <View style={styles.errorRow} accessibilityRole="alert">
              <Icon name="alert-circle" size={21} color={theme.colors.danger} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong" tone="danger">{tr("Unable to load help articles")}</AppText>
                <AppText variant="caption" tone="danger" style={styles.errorCopy}>{error}</AppText>
              </View>
            </View>
            <Button title={tr("Try again")} onPress={() => void load()} variant="outline" fullWidth style={{ marginTop: 12 }} />
          </AppCard>
        ) : faqs.length === 0 ? (
          <AppCard elevated={false} style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <View style={styles.emptyFaqs}>
              <Icon name="book-open" size={30} color={theme.colors.textMuted} />
              <AppText variant="bodyStrong" align="center">{tr("No help articles are available right now")}</AppText>
              <AppText variant="caption" tone="secondary" align="center">{tr("Please contact support and we will help you directly.")}</AppText>
            </View>
          </AppCard>
        ) : (
          faqs.map((faq) => (
            <FaqCard
              key={faq.id}
              faq={faq}
              open={openId === faq.id}
              onToggle={() => setOpenId((current) => current === faq.id ? null : faq.id)}
            />
          ))
        )}

        {error && faqs.length > 0 ? (
          <View style={[styles.warning, { backgroundColor: theme.colors.warningSoft }]} accessibilityRole="alert">
            <Icon name="wifi-off" size={17} color={theme.colors.warning} />
            <AppText variant="caption" style={[styles.flex, { color: theme.colors.warning }]}>
              {tr("Showing saved help articles. Pull-to-refresh is unavailable until your connection returns.")}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  heroRow: { flexDirection: "row", alignItems: "flex-start", gap: 13 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroCopy: { lineHeight: 20, marginTop: 4 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  flexButton: { flex: 1 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 },
  faqCard: { gap: 0 },
  faqQuestionRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  faqIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  answerWrap: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 14, gap: 10 },
  answer: { lineHeight: 21 },
  loadingBox: { alignItems: "center", gap: 10, paddingVertical: 34 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  errorCopy: { lineHeight: 19, marginTop: 4 },
  emptyFaqs: { alignItems: "center", gap: 9, paddingVertical: 10 },
  warning: { borderRadius: 13, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
});
