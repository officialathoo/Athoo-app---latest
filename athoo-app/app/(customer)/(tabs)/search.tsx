import { AthooMapFallback } from "@/components/maps/AthooMapFallback";
import { Icon } from "@/components/ui/Icon";
import * as Location from "expo-location";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  AppState,
} from "react-native";
import { PrivateImage } from "@/services/storage";
import { reverseGeocodeGoogle } from "@/services/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { realtime } from "@/services/api";
import { useLang } from "@/context/LanguageContext";
import { api } from "@/services/api";
import { getDistanceKm } from "@/utils/distance";
import { matchingCategories, normalizeDiscoveryText, providerRecommendationScore } from "@/utils/discovery";

// Only the "All Areas" sentinel is hardcoded here — actual city names are
// loaded live from /api/service-areas below so this list always matches the
// admin-managed, Pakistan-wide service_areas reference table.
const DEFAULT_CITIES = ["All Areas"];

type ExtendedProvider = Provider & {
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

function isValidMapCoord(latitude?: number, longitude?: number) {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}


export default function SearchScreen() {
  const { providerId, providerRate, pickAddress } = useLocalSearchParams<{ providerId?: string; providerRate?: string; pickAddress?: string }>();
  const { isUrdu } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const mapRef = useRef<any | null>(null);
  const { categories, getCategoryBySlug } = useCategories();

  const [cities, setCities] = useState<string[]>(DEFAULT_CITIES);
  const [query, setQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("All Areas");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [sortBy, setSortBy] = useState<"recommended" | "nearby" | "rating" | "jobs">("recommended");

  const [allProviders, setAllProviders] = useState<ExtendedProvider[]>([]);
  const [userLat, setUserLat] = useState<number | undefined>(undefined);
  const [userLng, setUserLng] = useState<number | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ExtendedProvider | null>(null);

  const [pickedLocation, setPickedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [pickedAddress, setPickedAddress] = useState("");
  const [resolvingAddress, setResolvingAddress] = useState(false);

  const loadServiceAreas = useCallback(() => {
    api.getActiveServiceAreas()
      .then(d => {
        if (d.areas?.length) {
          const names = ["All Areas", ...d.areas.filter((a: any) => a.isActive !== false).map((a) => a.name)];
          setCities(names);
          if (selectedCity !== "All Areas" && !names.includes(selectedCity)) setSelectedCity("All Areas");
        }
      })
      .catch(() => {});
  }, [selectedCity]);

  useEffect(() => {
    loadServiceAreas();
    const off = realtime.on((msg) => {
      if (msg.type === "admin:event" && (msg.payload as any)?.resource === "service-areas") {
        loadServiceAreas();
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") loadServiceAreas();
    });
    return () => { off(); sub.remove(); };
  }, [loadServiceAreas]);

  useFocusEffect(
    useCallback(() => {
      if (pickAddress === "1" || !!providerId) {
        setShowMap(true);
      }
    }, [pickAddress, providerId])
  );

  const handleLocateMe = async () => {
    if (Platform.OS === "web") return;

    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setUserLat(loc.coords.latitude);
      setUserLng(loc.coords.longitude);

      if (mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          },
          500
        );
      }
    } catch (e) {
      // locate error — silently ignore, user can proceed without GPS
    }
    setLocating(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (userLat !== undefined && userLng !== undefined) return;
      handleLocateMe();
    }, [userLat, userLng])
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      const load = async () => {
        setLoadingProviders(true);
        try {
          const res = await api.getProviders();
          const raw = (res.providers as Provider[]) || [];

          const mapped: ExtendedProvider[] = raw.map((p) => {
            const locationText =
              ((p as any).location as string) ||
              ((p as any).address as string) ||
              ((p as any).city as string) ||
              "";

            const rawLat = (p as any).latitude ?? (p as any).lat;
            const rawLng = (p as any).longitude ?? (p as any).lng;
            const parsedLat = typeof rawLat === "number" ? rawLat : typeof rawLat === "string" ? Number(rawLat) : NaN;
            const parsedLng = typeof rawLng === "number" ? rawLng : typeof rawLng === "string" ? Number(rawLng) : NaN;
            const hasRealCoords = isValidMapCoord(parsedLat, parsedLng);
            const latitude = hasRealCoords ? parsedLat : undefined;
            const longitude = hasRealCoords ? parsedLng : undefined;

            const distanceKm =
              hasRealCoords && userLat !== undefined && userLng !== undefined
                ? getDistanceKm(userLat, userLng, parsedLat, parsedLng)
                : undefined;

            return {
              ...(p as ExtendedProvider),
              latitude,
              longitude,
              distanceKm,
            };
          });

          if (alive) setAllProviders(mapped);
        } catch {
          if (alive) setAllProviders([]);
        } finally {
          if (alive) setLoadingProviders(false);
        }
      };

      load();

      return () => {
        alive = false;
      };
    }, [userLat, userLng])
  );

  const categoryMatches = useMemo(() => matchingCategories(query, categories), [query, categories]);
  const inferredServiceSlugs = useMemo(() => new Set(categoryMatches.map((category) => category.slug)), [categoryMatches]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeDiscoveryText(query);
    return allProviders.filter((p) => {
      const providerServices = (p.services || []).map((service) => getCategoryBySlug(service)).filter(Boolean);
      const providerSearchText = normalizeDiscoveryText([
        p.name,
        (p as any).location,
        (p as any).address,
        (p as any).city,
        ...providerServices.flatMap((category) => [category?.name, category?.nameUrdu, category?.description, ...(category?.searchKeywords || [])]),
      ].filter(Boolean).join(" "));

      const matchesQuery = !normalizedQuery || providerSearchText.includes(normalizedQuery) ||
        (p.services || []).some((service) => inferredServiceSlugs.has(service));
      const matchesService = !selectedService || (p.services || []).some((service) => getCategoryBySlug(service)?.slug === selectedService || service === selectedService);
      const locationText = normalizeDiscoveryText(`${(p as any).location || ""} ${(p as any).address || ""} ${(p as any).city || ""}`);
      const matchesCity = selectedCity === "All Areas" || locationText.includes(normalizeDiscoveryText(selectedCity));
      return matchesQuery && matchesService && matchesCity;
    });
  }, [allProviders, query, selectedService, selectedCity, getCategoryBySlug, inferredServiceSlugs]);

  const sorted = useMemo(() => {
    const list = [...filtered];

    list.sort((a, b) => {
      if (sortBy === "recommended") return providerRecommendationScore(b) - providerRecommendationScore(a);
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "jobs") return (b.totalJobs || 0) - (a.totalJobs || 0);
      return (a.distanceKm || 9999) - (b.distanceKm || 9999);
    });

    return list;
  }, [filtered, sortBy]);

  const focusProvider = (provider: ExtendedProvider) => {
    setSelectedProvider(provider);

    if (
      mapRef.current &&
      typeof provider.latitude === "number" &&
      typeof provider.longitude === "number"
    ) {
      mapRef.current.animateToRegion(
        {
          latitude: provider.latitude,
          longitude: provider.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        500
      );
    }
  };

  const resolveAddressFromCoords = async (
    latitude: number,
    longitude: number
  ): Promise<string> => {
    try {
      setResolvingAddress(true);
      const resolved = (await reverseGeocodeGoogle(latitude, longitude)) || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setPickedAddress(resolved);
      return resolved;
    } catch {
      const fallback = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setPickedAddress(fallback);
      return fallback;
    } finally {
      setResolvingAddress(false);
    }
  };

  const navigateBackToBooking = (
    latitude: number,
    longitude: number,
    address: string
  ) => {
    router.replace({
      pathname: "/(customer)/book-service",
      params: {
        providerId: providerId || "",
        providerRate: providerRate ? String(providerRate) : undefined,
        pickedAddress: address,
        pickedLat: latitude.toString(),
        pickedLng: longitude.toString(),
      },
    } as any);
  };

  const handleMapPress = async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPickedLocation({ latitude, longitude });

    const resolvedAddress = await resolveAddressFromCoords(latitude, longitude);

    if (providerId) {
      navigateBackToBooking(latitude, longitude, resolvedAddress);
    }
  };

  const openSelectedProvider = () => {
    if (!selectedProvider) return;
    router.push({
      pathname: "/(customer)/provider-detail",
      params: { providerId: selectedProvider.id },
    });
  };

  const bookSelectedProvider = () => {
    if (!selectedProvider) return;

    router.replace({
      pathname: "/(customer)/book-service",
      params: {
        providerId: selectedProvider.id,
        pickedAddress: pickedAddress || undefined,
        pickedLat: pickedLocation?.latitude?.toString(),
        pickedLng: pickedLocation?.longitude?.toString(),
      },
    } as any);
  };

  const usePickedAddressOnly = () => {
    if (!pickedLocation || !pickedAddress) return;

    router.replace({
      pathname: "/(customer)/book-service",
      params: {
        providerId: providerId || selectedProvider?.id || "",
        pickedAddress,
        pickedLat: pickedLocation.latitude.toString(),
        pickedLng: pickedLocation.longitude.toString(),
      },
    } as any);
  };

  const initialRegion =
    userLat !== undefined && userLng !== undefined
      ? {
          latitude: userLat,
          longitude: userLng,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }
      : {
          latitude: 33.6844,
          longitude: 73.0479,
          latitudeDelta: 0.18,
          longitudeDelta: 0.18,
        };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Icon name="search" size={17} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={isUrdu ? "خدمات، ملازمین تلاش کریں..." : "Search services, workers..."}
              value={query}
              onChangeText={setQuery}
              placeholderTextColor={Colors.textMuted}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <Icon name="x" size={16} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.mapToggle, showMap && styles.mapToggleActive]}
            onPress={() => setShowMap(!showMap)}
          >
            <Icon name="map" size={20} color={showMap ? "#fff" : Colors.primary} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.cityRow}>
            {cities.map((c) => (
              <Pressable
                key={c}
                onPress={() => setSelectedCity(c)}
                style={[styles.cityChip, selectedCity === c && styles.cityChipActive]}
              >
                <Text style={[styles.cityText, selectedCity === c && styles.cityTextActive]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.sortRow}>
            {[
              { label: "Recommended", value: "recommended" as const },
              { label: "Nearest", value: "nearby" as const },
              { label: "Top Rated", value: "rating" as const },
              { label: "Most Jobs", value: "jobs" as const },
            ].map((item) => (
              <Pressable
                key={item.value}
                onPress={() => setSortBy(item.value)}
                style={[
                  styles.sortChip,
                  sortBy === item.value && styles.sortChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.sortText,
                    sortBy === item.value && styles.sortTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {showMap ? (
        <View style={styles.mapContainer}>
          {Platform.OS === "web" ? (
            <View
              style={[
                styles.mapBg,
                { alignItems: "center", justifyContent: "center", backgroundColor: "#e8f0fe" },
              ]}
            >
              <Icon name="map-pin" size={40} color={Colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text, marginTop: 12 }}>
                Map available in mobile app
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: Colors.textSecondary,
                  marginTop: 6,
                  textAlign: "center",
                  paddingHorizontal: 24,
                }}
              >
                Open Athoo in the Expo Go app on your phone to view the map
              </Text>
            </View>
          ) : loadingProviders ? (
            <View style={[styles.mapBg, styles.mapLoader]}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.mapLoaderText}>Loading nearby workers...</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <AthooMapFallback latitude={pickedLocation?.latitude ?? userLat} longitude={pickedLocation?.longitude ?? userLng} draggable={pickAddress === "1"} onCoordinateChange={(latitude, longitude) => void handleMapPress({ nativeEvent: { coordinate: { latitude, longitude } } } as any)} />

              <Pressable style={styles.locateMeBtn} onPress={handleLocateMe}>
                {locating ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Icon
                    name="navigation"
                    size={20}
                    color={userLat ? Colors.primary : Colors.textSecondary}
                  />
                )}
              </Pressable>
            </View>
          )}

          {!!pickedLocation && (
            <View style={styles.pickedAddressBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickedAddressLabel}>Selected Address</Text>
                <Text style={styles.pickedAddressText} numberOfLines={2}>
                  {resolvingAddress ? "Getting address..." : pickedAddress || "Picked from map"}
                </Text>
              </View>
              <Pressable
                style={styles.useAddressBtn}
                onPress={usePickedAddressOnly}
                disabled={resolvingAddress}
              >
                <Text style={styles.useAddressBtnText}>Use This</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.mapBottomSheet}>
            <View style={styles.mapHandle} />
            <Text style={styles.mapCount}>{sorted.length} workers in this area</Text>

            {selectedProvider ? (
              <View style={styles.selectedProviderBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedProviderName}>{selectedProvider.name}</Text>
                  <Text style={styles.selectedProviderMeta}>
                    {selectedProvider.distanceKm
                      ? `${selectedProvider.distanceKm.toFixed(1)} km away`
                      : "Nearby provider"}
                  </Text>
                </View>

                <View style={styles.selectedButtonsRow}>
                  <Pressable style={styles.profileBtn} onPress={openSelectedProvider}>
                    <Text style={styles.profileBtnText}>Profile</Text>
                  </Pressable>
                  <Pressable style={styles.bookBtn} onPress={bookSelectedProvider}>
                    <Text style={styles.bookBtnText}>Book Now</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.mapProviderRow}>
                  {(sorted.slice(0, 8) as any[]).map((p) => {
                    const firstSvcId = p.services?.[0];
                    const cat = getCategoryBySlug(firstSvcId || "");
                    const svcLabel = cat?.name || "Service";
                    const color = p.profileColor || Colors.primary;
                    const rating = p.rating ? (p.rating / 10).toFixed(1) : "New";
                    const rateLabel = p.ratePerHour
                      ? `Rs. ${p.ratePerHour.toLocaleString()}/hr`
                      : "Negotiable";

                    return (
                      <Pressable
                        key={p.id}
                        style={[
                          styles.mapProviderCard,
                          (selectedProvider as any)?.id === p.id && styles.mapProviderCardActive,
                        ]}
                        onPress={() => focusProvider(p)}
                      >
                        {p.profileImage ? (
                          <PrivateImage objectPath={p.profileImage} style={styles.mapProviderAvatar} />
                        ) : (
                          <View
                            style={[
                              styles.mapProviderAvatar,
                              {
                                backgroundColor: color + "25",
                                borderColor: color + "50",
                              },
                            ]}
                          >
                            <Text style={[styles.mapProviderAvatarText, { color }]}>
                              {getInitials(p.name)}
                            </Text>
                          </View>
                        )}

                        <Text style={styles.mapProviderName}>{p.name.split(" ")[0]}</Text>
                        <Text style={styles.mapProviderService}>{svcLabel}</Text>

                        <View style={styles.mapProviderRating}>
                          <Icon name="star" size={10} color={Colors.accent} />
                          <Text style={styles.mapProviderRatingText}>{rating}</Text>
                        </View>

                        <Text style={styles.mapProviderPrice}>{rateLabel}</Text>

                        {typeof p.distanceKm === "number" && (
                          <Text style={styles.mapProviderDistance}>
                            {p.distanceKm.toFixed(1)} km
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            <Pressable style={styles.viewListBtn} onPress={() => setShowMap(false)}>
              <Text style={styles.viewListText}>View Full List</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {query.trim().length > 0 && categoryMatches.length > 0 && (
            <View style={styles.matchHint} accessibilityRole="summary">
              <Icon name="sparkles" size={15} color={Colors.primary} />
              <Text style={styles.matchHintText}>Matching {categoryMatches.slice(0, 3).map((category) => category.name).join(", ")}</Text>
            </View>
          )}

          {!query && (
            <AnimatedCard delay={60}>
              <View style={styles.servicesSection}>
                <Text style={styles.sectionLabel}>Browse by Service</Text>
                <View style={styles.servicesGrid}>
                  {categories.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => setSelectedService(selectedService === s.slug ? null : s.slug)}
                      style={[
                        styles.serviceGridItem,
                        selectedService === s.slug && {
                          backgroundColor: s.bgColor,
                          borderColor: s.color,
                        },
                      ]}
                    >
                      <Icon
                        name={s.icon as any}
                        size={18}
                        color={selectedService === s.slug ? s.color : Colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.serviceGridText,
                          selectedService === s.slug && { color: s.color },
                        ]}
                      >
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </AnimatedCard>
          )}

          <View style={styles.resultsHeader}>
            <Text style={styles.sectionLabel}>
              {selectedService
                ? `${getCategoryBySlug(selectedService || "")?.name} Workers`
                : query
                ? `Results for "${query}"`
                : "All Workers"}
            </Text>
            <Text style={styles.resultCount}>
              {sorted.length} found •{" "}
              {sortBy === "recommended"
                ? "Recommended"
                : sortBy === "nearby"
                ? "Nearest first"
                : sortBy === "rating"
                ? "Top rated"
                : "Most jobs"}
            </Text>
          </View>

          {loadingProviders ? (
            <View style={styles.loadingListWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingListText}>Loading workers...</Text>
            </View>
          ) : sorted.length === 0 ? (
            <AnimatedCard>
              <View style={styles.emptyState}>
                <Icon name="search" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>{isUrdu ? "کوئی ملازم نہیں ملا" : "No workers found"}</Text>
                <Text style={styles.emptySubtitle}>{isUrdu ? "مختلف تلاش یا خدمت آزمائیں" : "Try a different search or service"}</Text>
              </View>
            </AnimatedCard>
          ) : (
            sorted.map((p, i) => (
              <AnimatedCard key={p.id} delay={80 + i * 50}>
                <View style={styles.listCardWrap}>
                  {typeof p.distanceKm === "number" && (
                    <View style={styles.distanceBadge}>
                      <Icon name="navigation" size={11} color={Colors.primary} />
                      <Text style={styles.distanceBadgeText}>
                        {p.distanceKm.toFixed(1)} km
                      </Text>
                    </View>
                  )}

                  <ProviderCard
                    provider={p}
                    onPress={() =>
                      router.push({
                        pathname: "/(customer)/provider-detail",
                        params: { providerId: p.id },
                      })
                    }
                  />
                </View>
              </AnimatedCard>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 10,
    paddingTop: 16,
    gap: 10,
  },

  searchRow: { flexDirection: "row", gap: 10 },

  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  mapToggle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  mapToggleActive: { backgroundColor: Colors.primary },

  cityRow: { flexDirection: "row", gap: 8 },

  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  cityChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  cityText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  cityTextActive: { color: "#fff" },

  sortRow: { flexDirection: "row", gap: 8, paddingTop: 2 },

  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  sortChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },

  sortText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
  },

  sortTextActive: {
    color: "#fff",
  },

  mapContainer: { flex: 1 },
  mapBg: { flex: 1 },

  mapLoader: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },

  mapLoaderText: {
    marginTop: 10,
    color: Colors.textSecondary,
  },

  locateMeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },

  pickedAddressBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  pickedAddressLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
    marginBottom: 2,
  },

  pickedAddressText: {
    fontSize: 12,
    color: Colors.text,
    lineHeight: 17,
  },

  useAddressBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  useAddressBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

  mapBottomSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },

  mapHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
  },

  mapCount: { fontSize: 14, fontWeight: "700", color: Colors.text },

  selectedProviderBox: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },

  selectedProviderName: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.text,
  },

  selectedProviderMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },

  selectedButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },

  profileBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },

  profileBtnText: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: 13,
  },

  bookBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },

  bookBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  mapProviderRow: { flexDirection: "row", gap: 12 },

  mapProviderCard: {
    width: 108,
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  mapProviderCardActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },

  mapProviderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary,
  },

  mapProviderAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },

  mapProviderName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
  },

  mapProviderService: {
    fontSize: 10,
    color: Colors.textSecondary,
  },

  mapProviderRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  mapProviderRatingText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.text,
  },

  mapProviderPrice: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
    textAlign: "center",
  },

  mapProviderDistance: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  viewListBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },

  viewListText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  scroll: { flex: 1 },
  matchHint: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.primary + "33" },
  matchHintText: { flex: 1, color: Colors.primaryDark, fontSize: 13, fontWeight: "700" },

  scrollContent: { padding: 20, paddingBottom: 100 },

  servicesSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },

  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  serviceGridItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },

  serviceGridText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },

  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  resultCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  loadingListWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },

  loadingListText: {
    marginTop: 10,
    color: Colors.textSecondary,
  },

  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 60,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },

  listCardWrap: {
    position: "relative",
  },

  distanceBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  distanceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
  },
});
