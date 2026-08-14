import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { redesign } from "@/design/redesign";
import { getCategoryAppearance } from "@/utils/categoryAppearance";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api, realtime } from "@/services/api";
import { getFastForegroundLocation } from "@/services/location";
import { useAuth } from "@/context/AuthContext";


type ExtendedProvider = Provider & {
  distanceKm?: number;
};

// Only the "All" sentinel is hardcoded — city names are loaded live from
// /api/service-areas below so this filter list always matches the
// admin-managed, Pakistan-wide service_areas reference table.
const DEFAULT_CITY_FILTERS = ["All"];
const PROVIDER_PAGE_SIZE = 25;
const PROVIDER_SEARCH_DEBOUNCE_MS = 350;



export default function ServiceProvidersScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [sortBy, setSortBy] = useState<"rating" | "jobs" | "nearby">("nearby");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [providers, setProviders] = useState<ExtendedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [providerRefreshVersion, setProviderRefreshVersion] = useState(0);

  const [cityFilter, setCityFilter] = useState("All");
  const [cityFilters, setCityFilters] = useState<string[]>(DEFAULT_CITY_FILTERS);
  const [areaQuery, setAreaQuery] = useState("");
  const [debouncedAreaQuery, setDebouncedAreaQuery] = useState("");
  const [locationReady, setLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const requestVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const { user, toggleSaved } = useAuth();
  const { getCategoryBySlug } = useCategories();

  const category = getCategoryBySlug(serviceId || "");
  const categoryAppearance = category ? getCategoryAppearance(category, theme) : null;

  useEffect(() => {
    const loadLocation = async () => {
      try {
        const result = await getFastForegroundLocation({
          timeoutMs: 7_000,
          rationaleTitle: "Location permission",
          rationaleBody: "Athoo uses your location to sort nearby providers.",
        });

        if (!result.location) {
          setSortBy("rating");
          return;
        }

        setUserLocation({
          latitude: result.location.latitude,
          longitude: result.location.longitude,
        });
      } catch {
        setSortBy("rating");
      } finally {
        setLocationReady(true);
      }
    };

    void loadLocation();
  }, []);

  useEffect(() => {
    api
      .getActiveServiceAreas()
      .then((d) => {
        const names = (d.areas || []).filter((a) => a.isActive !== false).map((a) => a.name);
        if (names.length) setCityFilters(["All", ...names]);
      })
      .catch(() => {
        // silent fail — keep the "All" sentinel only
      });
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedAreaQuery(areaQuery.trim()),
      PROVIDER_SEARCH_DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [areaQuery]);

  useEffect(() => realtime.on((message) => {
    const payload = (message.payload || {}) as Record<string, unknown>;
    if (message.type !== "admin:event" || payload.resource !== "providers" || typeof payload.providerId !== "string") return;
    setProviders((current) => current.map((provider) => provider.id === payload.providerId
      ? {
          ...provider,
          ...(typeof payload.ratePerHour === "number" ? { ratePerHour: payload.ratePerHour } : {}),
          ...(Array.isArray(payload.services) ? { services: payload.services.map(String) } : {}),
        }
      : provider));
    setProviderRefreshVersion((version) => version + 1);
  }), []);

  const loadProviders = useCallback(async (
    mode: "initial" | "more",
    cursor?: string,
  ) => {
    if (!locationReady) return;
    if (sortBy === "nearby" && !userLocation) return;
    if (mode === "more" && loadingMoreRef.current) return;

    const requestVersion = ++requestVersionRef.current;

    if (mode === "initial") {
      loadingMoreRef.current = false;
      setLoading(true);
      setLoadingMore(false);
      setLoadError(null);
      setProviders([]);
      setHasMore(false);
      setNextCursor(null);
    } else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
      setLoadError(null);
    }

    try {
      const sid = serviceId === "all" ? undefined : serviceId;
      const serverSort = sortBy === "rating" ? "top" : sortBy;

      const res = await api.getProviderDiscovery(sid, {
        limit: PROVIDER_PAGE_SIZE,
        sort: serverSort,
        cursor,
        available: onlyAvailable,
        city: cityFilter === "All" ? undefined : cityFilter,
        query: debouncedAreaQuery || undefined,
        latitude: serverSort === "nearby" ? userLocation?.latitude : undefined,
        longitude: serverSort === "nearby" ? userLocation?.longitude : undefined,
      });

      if (requestVersion !== requestVersionRef.current) return;

      const mapped = ((res.providers as Provider[]) || []).map((provider) => ({
        ...(provider as ExtendedProvider),
        distanceKm:
          typeof (provider as ExtendedProvider).distanceKm === "number"
            ? (provider as ExtendedProvider).distanceKm
            : undefined,
      }));

      setProviders((current) => {
        if (mode === "initial") return mapped;

        const byId = new Map(current.map((provider) => [provider.id, provider]));
        mapped.forEach((provider) => byId.set(provider.id, provider));
        return Array.from(byId.values());
      });
      setHasMore(Boolean(res.hasMore));
      setNextCursor(res.nextCursor || null);
    } catch {
      if (requestVersion !== requestVersionRef.current) return;
      setLoadError("We couldn't load workers right now. Check your connection and try again.");
      if (mode === "initial") {
        setProviders([]);
        setHasMore(false);
        setNextCursor(null);
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        if (mode === "initial") setLoading(false);
        else setLoadingMore(false);
      }
      if (mode === "more") loadingMoreRef.current = false;
    }
  }, [
    cityFilter,
    debouncedAreaQuery,
    locationReady,
    onlyAvailable,
    serviceId,
    sortBy,
    userLocation,
  ]);

  useEffect(() => {
    if (!locationReady) return;
    void loadProviders("initial");
  }, [loadProviders, locationReady, providerRefreshVersion]);

  const loadMoreProviders = () => {
    if (!hasMore || !nextCursor || loadingMoreRef.current) return;
    void loadProviders("more", nextCursor);
  };

  const handleSortChange = (nextSort: "rating" | "jobs" | "nearby") => {
    if (nextSort === "nearby" && !userLocation) {
      Alert.alert(
        "Location Required",
        "Turn on location access to sort workers by nearest distance.",
      );
      return;
    }

    setSortBy(nextSort);
  };

  const isSaved = (id: string) => {
    return !!user?.savedProviders?.includes(id);
  };

  const handleToggleSaved = async (providerId: string) => {
    if (!user) {
      Alert.alert("Login Required", "Please login to save providers.");
      return;
    }

    await toggleSaved(providerId);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>

        <Pressable
          style={styles.mapBtn}
          onPress={() =>
            router.push({
              pathname: "/(customer)/map",
              params: { serviceId: serviceId || "all" },
            } as any)
          }
        >
          <Icon name="map" size={18} color={theme.colors.primary} />
        </Pressable>

        <View style={styles.titleSection}>
          {category && (
            <View
              style={[
                styles.categoryIcon,
                { backgroundColor: categoryAppearance?.background || theme.colors.surfaceAlt },
              ]}
            >
              <Icon
                name={category.icon as any}
                size={18}
                color={categoryAppearance?.accent || theme.colors.primary}
              />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {category ? category.name : "All Workers"}
            </Text>
            <Text style={styles.subtitle}>{providers.length}{hasMore ? "+" : ""} workers loaded</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Icon name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={areaQuery}
            onChangeText={setAreaQuery}
            placeholder="Search area, sector, or provider"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.cityRow}>
            {cityFilters.map((city) => (
              <Pressable
                key={city}
                style={[
                  styles.cityChip,
                  cityFilter === city && styles.cityChipActive,
                ]}
                onPress={() => setCityFilter(city)}
              >
                <Text
                  style={[
                    styles.cityChipText,
                    cityFilter === city && styles.cityChipTextActive,
                  ]}
                >
                  {city}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.sortRow}>
            {[
              { label: "Nearest", value: "nearby" as const },
              { label: "Top Rated", value: "rating" as const },
              { label: "Most Jobs", value: "jobs" as const },
            ].map((item) => (
              <Pressable
                key={item.value}
                style={[
                  styles.sortChip,
                  sortBy === item.value && styles.sortChipActive,
                ]}
                onPress={() => handleSortChange(item.value)}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    sortBy === item.value && styles.sortChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Pressable
          style={[
            styles.availableToggle,
            onlyAvailable && styles.availableToggleActive,
          ]}
          onPress={() => setOnlyAvailable((prev) => !prev)}
        >
          <Icon
            name="check-circle"
            size={14}
            color={onlyAvailable ? theme.colors.success : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.availableToggleText,
              onlyAvailable && styles.availableToggleTextActive,
            ]}
          >
            Available
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Finding workers...</Text>
        </View>
      ) : loadError && providers.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="alert-circle" size={40} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't load workers</Text>
          <Text style={styles.emptySubtitle}>{loadError}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => void loadProviders("initial")}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : providers.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="users" size={40} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No workers found</Text>
          <Text style={styles.emptySubtitle}>
            Try changing area, city, availability, or sort filters.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {providers.map((p) => (
            <View key={p.id} style={styles.cardWrap}>
              <Pressable onPress={() => handleToggleSaved(p.id)} style={styles.saveBtn}>
                <Icon
                  name={isSaved(p.id) ? "heart" : "heart-outline"}
                  size={16}
                  color={isSaved(p.id) ? theme.colors.danger : theme.colors.textSecondary}
                />
              </Pressable>

              {typeof p.distanceKm === "number" && (
                <View style={styles.distanceBadge}>
                  <Icon name="navigation" size={11} color={theme.colors.primary} />
                  <Text style={styles.distanceText}>
                    {p.distanceKm.toFixed(1)} km
                  </Text>
                </View>
              )}

              <ProviderCard
                provider={p}
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/provider-detail",
                    params: {
                      providerId: p.id,
                      serviceId: serviceId && serviceId !== "all" ? serviceId : undefined,
                    },
                  } as any)
                }
              />
            </View>
          ))}

          {loadError && providers.length > 0 && (
            <View style={styles.inlineError}>
              <Text style={styles.emptySubtitle}>{loadError}</Text>
            </View>
          )}

          {hasMore && nextCursor && (
            <Pressable
              style={[styles.loadMoreButton, loadingMore && styles.loadMoreButtonDisabled]}
              onPress={loadMoreProviders}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={theme.colors.onBrand} />
              ) : (
                <Text style={styles.loadMoreText}>Load more workers</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: redesign.visual.cardBorderWidth,
    borderBottomColor: theme.colors.border,
    ...theme.shadows.sm,
  },

  backBtn: {
    position: "absolute",
    left: redesign.layout.horizontalPadding,
    top: 16,
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },

  mapBtn: {
    position: "absolute",
    right: redesign.layout.horizontalPadding,
    top: 16,
    width: redesign.control.iconButtonSize,
    height: redesign.control.iconButtonSize,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
    zIndex: 2,
  },

  titleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 50,
  },

  categoryIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  title: { ...theme.typography.h2, color: theme.colors.text, letterSpacing: -0.25 },

  subtitle: { ...theme.typography.caption, color: theme.colors.textSecondary, marginTop: 2 },

  searchWrap: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingBottom: 12,
    gap: 12,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.input,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    minHeight: redesign.control.standardHeight,
    borderWidth: redesign.visual.inputBorderWidth,
    borderColor: theme.colors.border,
  },

  searchInput: { flex: 1, ...theme.typography.body, color: theme.colors.text },

  cityRow: {
    flexDirection: "row",
    gap: 8,
  },

  cityChip: {
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },

  cityChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  cityChipText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary },

  cityChipTextActive: {
    color: theme.colors.onBrand,
  },

  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: redesign.layout.horizontalPadding,
    paddingVertical: 10,
    gap: 10,
  },

  sortRow: {
    flexDirection: "row",
    gap: 8,
  },

  sortChip: {
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },

  sortChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },

  sortChipText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary },

  sortChipTextActive: {
    color: theme.colors.onBrand,
  },

  availableToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
  },

  availableToggleActive: {
    backgroundColor: theme.colors.success + "10",
    borderColor: theme.colors.success + "40",
  },

  availableToggleText: { ...theme.typography.caption, fontFamily: theme.typography.label.fontFamily, color: theme.colors.textSecondary },

  availableToggleTextActive: {
    color: theme.colors.success,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  loadingText: { ...theme.typography.body, color: theme.colors.textSecondary },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },

  emptyTitle: { ...theme.typography.h3, color: theme.colors.text },

  emptySubtitle: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: "center" },

  retryButton: {
    marginTop: 4,
    paddingHorizontal: 18,
    minHeight: redesign.control.standardHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.sm,
  },

  retryButtonText: { color: theme.colors.onBrand, ...theme.typography.label },

  inlineError: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },

  loadMoreButton: {
    minHeight: redesign.control.standardHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    ...theme.shadows.sm,
  },

  loadMoreButtonDisabled: { opacity: redesign.visual.disabledOpacity },

  loadMoreText: { color: theme.colors.onBrand, ...theme.typography.label },

  list: {
    flex: 1,
  },

  listContent: {
    padding: redesign.layout.horizontalPadding,
    paddingBottom: 100,
    gap: redesign.layout.cardGap,
  },

  cardWrap: {
    position: "relative",
  },

  saveBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    zIndex: 5,
    width: 34,
    height: 34,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: redesign.visual.cardBorderWidth,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },

  distanceBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  distanceText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
  },
});
