import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api, type PublicPolicyDocument } from "@/services/api";

function cacheKey(slug: string): string {
  return `athoo_policy_document_v1:${slug}`;
}

function splitBody(body: string): string[] {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function DynamicPolicyDocumentScreen({ slug, fallback }: { slug: string; fallback?: React.ReactNode }) {
  const { theme } = useTheme();
  const { isUrdu, translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const [policy, setPolicy] = useState<PublicPolicyDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await api.getPolicy(slug);
      setPolicy(result.policy);
      setOffline(false);
      setNotFound(false);
      await AsyncStorage.setItem(cacheKey(slug), JSON.stringify(result.policy));
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      try {
        const cached = await AsyncStorage.getItem(cacheKey(slug));
        if (cached) {
          setPolicy(JSON.parse(cached));
          setOffline(true);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const title = policy ? (isUrdu && policy.titleUr ? policy.titleUr : policy.title) : tr("Policy document");
  const summary = policy ? (isUrdu && policy.summaryUr ? policy.summaryUr : policy.summary) : null;
  const body = policy ? (isUrdu && policy.bodyUr ? policy.bodyUr : policy.bodyEn) : "";
  const paragraphs = useMemo(() => splitBody(body), [body]);

  if (!loading && !policy && fallback) return <>{fallback}</>;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title={title} subtitle={policy ? tr("Version {{version}}", { version: policy.version }) : undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        {offline && (
          <AppCard elevated={false} style={{ backgroundColor: theme.colors.warningSoft }}>
            <View style={styles.noticeRow}>
              <Icon name="wifi-off" size={18} color={theme.colors.warning} />
              <AppText variant="caption" tone="secondary" style={styles.flex}>
                {tr("You are viewing the most recently saved copy of this policy.")}
              </AppText>
            </View>
          </AppCard>
        )}

        {loading && !policy ? (
          <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={tr("Loading policy")}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <AppText tone="secondary">{tr("Loading policy…")}</AppText>
          </View>
        ) : notFound && !policy ? (
          <AppCard elevated={false}>
            <View style={styles.empty}>
              <Icon name="file-x-2" size={32} color={theme.colors.textMuted} />
              <AppText variant="bodyStrong">{tr("Policy not available")}</AppText>
              <AppText variant="caption" tone="secondary" align="center">
                {tr("This policy may be under review. Pull down to try again or contact Athoo Support.")}
              </AppText>
            </View>
          </AppCard>
        ) : policy ? (
          <>
            <AppCard elevated={false} style={{ backgroundColor: theme.colors.infoSoft }}>
              <View style={styles.headerRow}>
                <View style={[styles.icon, { backgroundColor: theme.colors.surface }]}>
                  <Icon name="file-check-2" size={25} color={theme.colors.primary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="h3">{title}</AppText>
                  {summary ? <AppText variant="caption" tone="secondary" style={styles.summary}>{summary}</AppText> : null}
                  <AppText variant="caption" tone="muted" style={styles.version}>
                    {tr("Published version {{version}}", { version: policy.version })}
                  </AppText>
                </View>
              </View>
            </AppCard>

            {paragraphs.map((paragraph, index) => (
              <AppCard key={`${policy.slug}-${index}`} elevated={false}>
                <AppText tone="secondary" style={styles.paragraph}>{paragraph}</AppText>
              </AppCard>
            ))}

            <AppText variant="caption" tone="muted" align="center" style={styles.footer}>
              {tr("This is the current policy published by Athoo administration.")}
            </AppText>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  loading: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  summary: { lineHeight: 19, marginTop: 5 },
  version: { marginTop: 8 },
  paragraph: { lineHeight: 23 },
  footer: { marginVertical: 8 },
});
