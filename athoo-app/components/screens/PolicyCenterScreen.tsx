import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/context/AuthContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { api, type PublicPolicySummary } from "@/services/api";

const CACHE_KEY = "athoo_public_policy_index_v1";

function policyIcon(slug: string): string {
  if (slug.includes("privacy")) return "shield";
  if (slug.includes("terms")) return "file-check-2";
  if (slug.includes("community")) return "users";
  if (slug.includes("complaint")) return "messages-square";
  if (slug.includes("commission")) return "badge-dollar-sign";
  if (slug.includes("refund") || slug.includes("cancel")) return "rotate-ccw";
  if (slug.includes("restriction")) return "shield-alert";
  if (slug.includes("deletion") || slug.includes("retention")) return "archive";
  return "landmark";
}

export function PolicyCenterScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { isUrdu, translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const [policies, setPolicies] = useState<PublicPolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const audience = user?.role === "provider" ? "provider" : user?.role === "customer" ? "customer" : "all";

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await api.getPolicies(audience);
      setPolicies(result.policies || []);
      setOffline(false);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result.policies || []));
    } catch {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setPolicies(JSON.parse(cached));
      } catch {
        // Keep the last rendered list if the cache cannot be read.
      }
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [audience]);

  useEffect(() => { void load(); }, [load]);

  const visiblePolicies = useMemo(
    () => policies.filter((policy) => policy.audience === "all" || policy.audience === audience),
    [audience, policies],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title={tr("Policy center")} subtitle={tr("Current rules, rights, and platform controls")} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        {offline && (
          <AppCard elevated={false} style={{ backgroundColor: theme.colors.warningSoft }}>
            <View style={styles.noticeRow}>
              <Icon name="wifi-off" size={19} color={theme.colors.warning} />
              <AppText variant="caption" tone="secondary" style={styles.flex}>
                {tr("Showing the most recently saved policy list. Pull down to reconnect.")}
              </AppText>
            </View>
          </AppCard>
        )}

        <AppCard elevated={false} style={{ backgroundColor: theme.colors.infoSoft }}>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon name="book-open-check" size={27} color={theme.colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="h3">{tr("Clear policies, managed professionally")}</AppText>
              <AppText variant="caption" tone="secondary" style={styles.heroCopy}>
                {tr("Athoo publishes policy versions from the admin panel so customers and providers can always review the current approved wording.")}
              </AppText>
            </View>
          </View>
        </AppCard>

        {loading && visiblePolicies.length === 0 ? (
          <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={tr("Loading policies")}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <AppText tone="secondary">{tr("Loading policies…")}</AppText>
          </View>
        ) : visiblePolicies.length === 0 ? (
          <AppCard elevated={false}>
            <View style={styles.empty}>
              <Icon name="file-question" size={30} color={theme.colors.textMuted} />
              <AppText variant="bodyStrong">{tr("No published policies available")}</AppText>
              <AppText variant="caption" tone="secondary" align="center">
                {tr("Pull down to refresh or contact Athoo Support if this continues.")}
              </AppText>
            </View>
          </AppCard>
        ) : (
          visiblePolicies.map((policy) => {
            const title = isUrdu && policy.titleUr ? policy.titleUr : policy.title;
            const summary = isUrdu && policy.summaryUr ? policy.summaryUr : policy.summary;
            return (
              <Pressable
                key={policy.slug}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${tr("version")} ${policy.version}`}
                accessibilityHint={tr("Opens the full policy document")}
                onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug: policy.slug } } as any)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <AppCard elevated={false}>
                  <View style={styles.policyRow}>
                    <View style={[styles.policyIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Icon name={policyIcon(policy.slug) as any} size={21} color={theme.colors.primary} />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong">{title}</AppText>
                      {summary ? <AppText variant="caption" tone="secondary" style={styles.summary}>{summary}</AppText> : null}
                      <View style={styles.metaRow}>
                        <AppText variant="caption" tone="muted">{tr("Version {{version}}", { version: policy.version })}</AppText>
                        {policy.requiresAcceptance ? (
                          <View style={[styles.requiredBadge, { backgroundColor: theme.colors.warningSoft }]}>
                            <AppText variant="caption" tone="secondary">{tr("Acceptance required")}</AppText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Icon name="chevron-right" size={19} color={theme.colors.textMuted} />
                  </View>
                </AppCard>
              </Pressable>
            );
          })
        )}

        <AppText variant="caption" tone="muted" align="center" style={styles.footer}>
          {tr("Policy updates are reviewed and published by authorized Athoo administrators.")}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 13 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroCopy: { lineHeight: 19, marginTop: 4 },
  loading: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 9 },
  pressed: { opacity: 0.72 },
  policyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  policyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  summary: { lineHeight: 18, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 },
  requiredBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  footer: { marginVertical: 8 },
});
