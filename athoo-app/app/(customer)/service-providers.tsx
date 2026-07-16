import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { getCategoryAppearance } from "@/utils/categoryAppearance";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { getFastForegroundLocation } from "@/services/location";
import { useAuth } from "@/context/AuthContext";
import { getDistanceKm } from "@/utils/distance";

type ExtendedProvider = Provider & {
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

// Only the "All" sentinel is hardcoded — city names are loaded live from
// /api/service-areas below so this filter list always matches the
// admin-managed, Pakistan-wide service_areas reference table.
const DEFAULT_CITY_FILTERS = ["All"];

function isValidMapCoord(latitude?: number, longitude?: number) {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}


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

  const [cityFilter, setCityFilter] = useState("All");
  const [cityFilters, setCityFilters] = useState<string[]>(DEFAULT_CITY_FILTERS);
  const [areaQuery, setAreaQuery] = useState("");
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

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
        if (!result.location) return;

        setUserLocation({
          latitude: result.location.latitude,
          longitude: result.location.longitude,
        });
      } catch (e) {
        // silent fail — GPS unavailable, continue without location
      }
    };

    loadLocation();
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
    const load = async () => {
      setLoading(true);
      try {
        const sid = serviceId === "all" ? undefined : serviceId;
        const res = await api.getProviders(sid);

        const mapped = ((res.providers as Provider[]) || []).map((p) => {
          const locationText =
            (p as any).location ||
            (p as any).address ||
            (p as any).city ||
            "";

          const rawLat = (p as any).latitude ?? (p as any).lat;
          const rawLng = (p as any).longitude ?? (p as any).lng;
          const parsedLat = typeof rawLat === "number" ? rawLat : typeof rawLat === "string" ? Number(rawLat) : NaN;
          const parsedLng = typeof rawLng === "number" ? rawLng : typeof rawLng === "string" ? Number(rawLng) : NaN;
          const hasRealCoords = isValidMapCoord(parsedLat, parsedLng);
          const latitude = hasRealCoords ? parsedLat : undefined;
          const longitude = hasRealCoords ? parsedLng : undefined;

          const distanceKm =
            userLocation && hasRealCoords
              ? getDistanceKm(
                  userLocation.latitude,
                  userLocation.longitude,
                  parsedLat,
                  parsedLng
                )
              : undefined;

          return {
            ...(p as ExtendedProvider),
            latitude,
            longitude,
            distanceKm,
          };
        });

        setProviders(mapped);
      } catch (e) {
        // silent fail — show empty state
        setProviders([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [serviceId, userLocation]);

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

  const filtered = useMemo(() => {
    return providers.filter((p) => {
      if (onlyAvailable && !p.isAvailable) return false;

      const locationText = (
        ((p as any).location as string) ||
        ((p as any).address as string) ||
        ""
      ).toLowerCase();

      if (cityFilter !== "All" && !locationText.includes(cityFilter.toLowerCase())) {
        return false;
      }

      if (
        areaQuery.trim() &&
        !locationText.includes(areaQuery.trim().toLowerCase()) &&
        !p.name.toLowerCase().includes(areaQuery.trim().toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [providers, onlyAvailable, cityFilter, areaQuery]);

  const sorted = useMemo(() => {
    const list = [...filtered];

    list.sort((a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "jobs") return (b.totalJobs || 0) - (a.totalJobs || 0);
      if (sortBy === "nearby") {
        return (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999);
      }
      return 0;
    });

    return list;
  }, [filtered, sortBy]);

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
            <Text style={styles.subtitle}>{sorted.length} workers found</Text>
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
                onPress={() => setSortBy(item.value)}
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
      ) : sorted.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="users" size={40} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No workers found</Text>
          <Text style={styles.emptySubtitle}>
            Try changing area or city filter.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {sorted.map((p) => (
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
                    },
                  } as any)
                }
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  backBtn: {
    position: "absolute",
    left: 16,
    top: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  mapBtn: {
    position: "absolute",
    right: 16,
    top: 16,
    backgroundColor: theme.colors.surface,
    padding: 10,
    borderRadius: 12,
    elevation: 5,
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
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
  },

  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  searchWrap: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },

  cityRow: {
    flexDirection: "row",
    gap: 8,
  },

  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  cityChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  cityChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  cityChipTextActive: {
    color: theme.colors.onBrand,
  },

  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },

  sortRow: {
    flexDirection: "row",
    gap: 8,
  },

  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  sortChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },

  sortChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },

  sortChipTextActive: {
    color: theme.colors.onBrand,
  },

  availableToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  availableToggleActive: {
    backgroundColor: theme.colors.success + "10",
    borderColor: theme.colors.success + "40",
  },

  availableToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },

  availableToggleTextActive: {
    color: theme.colors.success,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  loadingText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  list: {
    flex: 1,
  },

  listContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 14,
  },

  cardWrap: {
    position: "relative",
  },

  saveBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    zIndex: 5,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 7,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
