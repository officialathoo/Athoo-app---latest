import { AppCard, AppText, Skeleton } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { useAuth } from "@/context/AuthContext";
import { Provider } from "@/data/services";
import { api } from "@/services/api";
import { useTheme } from "@/context/ThemeContext";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SavedProvidersScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { theme } = useTheme();
  const { user, toggleSaved } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSavedProviders();
      setProviders((res.providers as Provider[]) || []);
    } catch (loadError) {
      setError(String((loadError as Error)?.message || "Could not load saved providers."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadProviders(); }, [loadProviders]));

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable)),
    [providers],
  );

  const removeProvider = useCallback(async (provider: Provider) => {
    if (removingId) return;
    setRemovingId(provider.id);
    try {
      await toggleSaved(provider.id);
      setProviders((current) => current.filter((item) => item.id !== provider.id));
    } catch {
      Alert.alert("Could not update", "Your saved provider list was not changed. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }, [removingId, toggleSaved]);

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]} testID="saved-providers-screen">
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.colors.surfaceAlt }, pressed && styles.pressed]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <AppText variant="h2">Saved Providers</AppText>
          <AppText variant="caption" tone="secondary">
            {sortedProviders.length} trusted provider{sortedProviders.length === 1 ? "" : "s"}
          </AppText>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingList} accessibilityRole="progressbar" accessibilityLabel="Loading saved providers">
          {[0, 1, 2].map((item) => (
            <AppCard key={item} style={styles.skeletonCard}>
              <Skeleton width={54} height={54} radius={27} />
              <View style={styles.skeletonBody}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="38%" height={12} />
                <Skeleton width="75%" height={12} />
              </View>
            </AppCard>
          ))}
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <AppCard style={styles.stateCard}>
            <Icon name="alert-circle" size={32} color={theme.colors.danger} />
            <AppText variant="h3" align="center">Saved providers unavailable</AppText>
            <AppText variant="body" tone="secondary" align="center">{error}</AppText>
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={loadProviders} testID="saved-providers-retry">
              <AppText variant="label" tone="inverse">Try again</AppText>
            </Pressable>
          </AppCard>
        </View>
      ) : sortedProviders.length === 0 ? (
        <View style={styles.centerState}>
          <AppCard style={styles.stateCard}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Icon name="heart-outline" size={30} color={theme.colors.textMuted} />
            </View>
            <AppText variant="h3" align="center">Build your trusted provider list</AppText>
            <AppText variant="body" tone="secondary" align="center">
              Save providers you trust, then return here for faster repeat bookings on any device.
            </AppText>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => router.push("/(customer)/service-providers?serviceId=all" as never)}
              testID="saved-providers-browse"
            >
              <Icon name="search" size={16} color={theme.colors.white} />
              <AppText variant="label" tone="inverse">Browse Providers</AppText>
            </Pressable>
          </AppCard>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <AppCard style={[styles.tipCard, { backgroundColor: theme.colors.infoSoft }]}>
            <Icon name="shield-check" size={20} color={theme.colors.info} />
            <View style={styles.tipText}>
              <AppText variant="label">Your trusted shortlist</AppText>
              <AppText variant="caption" tone="secondary">Available providers appear first for quicker repeat service.</AppText>
            </View>
          </AppCard>

          {sortedProviders.map((provider) => (
            <View key={provider.id} style={styles.cardWrap}>
              <ProviderCard
                provider={provider}
                onPress={() => router.push({ pathname: "/(customer)/provider-detail", params: { providerId: provider.id } } as never)}
                rightAction={(
                  <Pressable
                    onPress={() => removeProvider(provider)}
                    disabled={removingId === provider.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${provider.name} from saved providers`}
                    testID={`saved-provider-remove-${provider.id}`}
                    style={({ pressed }) => [styles.removeButton, { backgroundColor: theme.colors.dangerSoft }, pressed && styles.pressed]}
                  >
                    <Icon name="heart" size={16} color={theme.colors.danger} />
                  </Pressable>
                )}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 },
  pressed: { opacity: 0.72 },
  headerTextWrap: { flex: 1, gap: 2 },
  loadingList: { padding: 16, gap: 12 },
  skeletonCard: { flexDirection: "row", gap: 12, alignItems: "center" },
  skeletonBody: { flex: 1, gap: 9 },
  centerState: { flex: 1, justifyContent: "center", padding: 20 },
  stateCard: { alignItems: "center", gap: 12, paddingVertical: 28 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  primaryButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  listContent: { padding: 16, paddingBottom: 40 },
  tipCard: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 16 },
  tipText: { flex: 1, gap: 2 },
  cardWrap: { position: "relative" },
  removeButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 8 },
});
