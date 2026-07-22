import { AthooMapFallback } from "@/components/maps/AthooMapFallback";
import { LocationSearchPicker, type LocationSelection, type SavedLocationOption } from "@/components/maps/LocationSearchPicker";
import { Icon } from "@/components/ui/Icon";
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
import { getRouteMetricsBatch, reverseGeocode } from "@/services/maps";
import { getFastForegroundLocation } from "@/services/location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { realtime } from "@/services/api";
import { useLang } from "@/context/LanguageContext";
import { api } from "@/services/api";
import { getDistanceKm } from "@/utils/distance";
import { matchingCategories, normalizeDiscoveryText, providerRecommendationScore } from "@/utils/discovery";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import type { AthooTheme } from "@/design/theme";
import { getCategoryAppearance } from "@/utils/categoryAppearance";

// Only the "All Areas" sentinel is hardcoded here — actual city names are
// loaded live from /api/service-areas below so this list always matches the
// admin-managed, Pakistan-wide service_areas reference table.
const DEFAULT_CITIES = ["All Areas"];

type ExtendedProvider = Provider & {
  latitude?: number;
  longitude?: number;
  /** Real road-route distance returned by the configured routing provider. */
  distanceKm?: number;
  routeDurationMin?: number | null;
  routeSource?: string;
  routeStatus?: "pending" | "routed" | "unavailable";
  /** Internal prefilter only. Never display this straight-line approximation. */
  straightLineDistanceKm?: number;
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
  const { t, isUrdu, translate: tr, textAlign, writingDirection } = useLang();
  const { theme } = useTheme();
  const { showError } = useToast();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const localizedText = { textAlign, writingDirection } as const;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
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
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null);
  const [locationError, setLocationError] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ExtendedProvider | null>(null);

  const [pickedLocation, setPickedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [pickedAddress, setPickedAddress] = useState("");
  const [pickedLocationSource, setPickedLocationSource] = useState<LocationSelection["source"] | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocationOption[]>([]);

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
      const payload = (msg.payload || {}) as Record<string, unknown>;
      if (msg.type === "admin:event" && payload.resource === "service-areas") {
        loadServiceAreas();
      }
      if (msg.type === "admin:event" && payload.resource === "providers" && typeof payload.providerId === "string") {
        setAllProviders((current) => current.map((provider) => provider.id === payload.providerId
          ? {
              ...provider,
              ...(typeof payload.ratePerHour === "number" ? { ratePerHour: payload.ratePerHour } : {}),
              ...(Array.isArray(payload.services) ? { services: payload.services.map(String) } : {}),
            }
          : provider));
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") loadServiceAreas();
    });
    return () => { off(); sub.remove(); };
  }, [loadServiceAreas]);

  useEffect(() => {
    let active = true;
    api.getAddresses()
      .then((response) => {
        if (!active || !Array.isArray(response?.addresses)) return;
        setSavedLocations(response.addresses.map((address: any) => ({
          id: String(address.id),
          label: String(address.label || tr("Saved address")),
          address: String(address.address || ""),
          latitude: address.latitude == null ? null : Number(address.latitude),
          longitude: address.longitude == null ? null : Number(address.longitude),
        })));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [tr]);

  useFocusEffect(
    useCallback(() => {
      if (pickAddress === "1" || !!providerId) {
        setShowMap(true);
      }
    }, [pickAddress, providerId])
  );

  const handleLocateMe = async (notifyOnFailure = false) => {
    if (Platform.OS === "web" || locating) return;

    setLocating(true);
    setLocationError("");
    try {
      const result = await getFastForegroundLocation({
        timeoutMs: 20_000,
        maxCacheAgeMs: 0,
        requiredAccuracy: 35,
        minimumFreshSamples: 2,
        maximumAcceptedAccuracy: 80,
        freshAccuracy: "navigation",
        preferFresh: true,
        requireFresh: true,
        rationaleTitle: tr("Location permission"),
        rationaleBody: tr("Athoo uses your precise live location to show nearby providers and choose the correct service address."),
      });

      if (!result.location) {
        setUserLat(undefined);
        setUserLng(undefined);
        setLocationAccuracyMeters(null);
        if (pickedLocationSource === "current") {
          setPickedLocation(null);
          setPickedAddress("");
          setPickedLocationSource(null);
        }
        const message = tr("Athoo could not obtain a precise live GPS fix. Enable Precise Location, move near an open area, or search and pin the address manually.");
        setLocationError(message);
        if (notifyOnFailure) showError(tr("Location not accurate enough"), message);
        return;
      }

      setLocationAccuracyMeters(result.location.accuracy);
      setUserLat(result.location.latitude);
      setUserLng(result.location.longitude);
      setPickedLocation({ latitude: result.location.latitude, longitude: result.location.longitude });
      setPickedLocationSource("current");
      const resolved = await resolveAddressFromCoords(result.location.latitude, result.location.longitude);
      if (!resolved) {
        const message = tr("GPS was found, but the street address could not be resolved. Confirm the pin before continuing.");
        setLocationError(message);
        if (notifyOnFailure) showError(tr("Address not resolved"), message);
      }
    } catch {
      setLocationAccuracyMeters(null);
      const message = tr("Athoo could not obtain your live location. Check GPS and Precise Location, or choose the address manually.");
      setLocationError(message);
      if (notifyOnFailure) showError(tr("Location unavailable"), message);
    } finally {
      setLocating(false);
    }
  };  useFocusEffect(
    useCallback(() => {
      if (userLat !== undefined && userLng !== undefined) return;
      void handleLocateMe(false);
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

            const straightLineDistanceKm =
              hasRealCoords && userLat !== undefined && userLng !== undefined
                ? getDistanceKm(userLat, userLng, parsedLat, parsedLng)
                : undefined;

            return {
              ...(p as ExtendedProvider),
              latitude,
              longitude,
              distanceKm: undefined,
              routeDurationMin: null,
              routeSource: undefined,
              routeStatus: hasRealCoords ? "pending" : undefined,
              straightLineDistanceKm,
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

  const routeCandidateKey = useMemo(() => {
    if (userLat === undefined || userLng === undefined) return "";
    return allProviders
      .filter((provider) => isValidMapCoord(provider.latitude, provider.longitude))
      .sort((a, b) =>
        (a.straightLineDistanceKm ?? Number.POSITIVE_INFINITY) -
        (b.straightLineDistanceKm ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, 12)
      .map((provider) =>
        `${provider.id}:${provider.latitude!.toFixed(5)},${provider.longitude!.toFixed(5)}`,
      )
      .join("|");
  }, [allProviders, userLat, userLng]);

  useEffect(() => {
    if (userLat === undefined || userLng === undefined || !routeCandidateKey) return;

    let active = true;
    const candidateIds = new Set(routeCandidateKey.split("|").map((entry) => entry.split(":")[0]));
    const candidates = allProviders
      .filter((provider) =>
        candidateIds.has(provider.id) &&
        isValidMapCoord(provider.latitude, provider.longitude),
      )
      .map((provider) => ({
        id: provider.id,
        lat: provider.latitude!,
        lng: provider.longitude!,
      }));

    setAllProviders((current) => current.map((provider) =>
      candidateIds.has(provider.id)
        ? {
            ...provider,
            distanceKm: undefined,
            routeDurationMin: null,
            routeSource: undefined,
            routeStatus: "pending",
          }
        : provider,
    ));

    void getRouteMetricsBatch(userLat, userLng, candidates).then((metrics) => {
      if (!active) return;
      const byId = new Map(metrics.map((metric) => [metric.id, metric]));

      setAllProviders((current) => current.map((provider) => {
        if (!candidateIds.has(provider.id)) return provider;
        const metric = byId.get(provider.id);
        if (!metric?.routed || metric.distanceKm == null) {
          return {
            ...provider,
            distanceKm: undefined,
            routeDurationMin: null,
            routeSource: metric?.source || "unavailable",
            routeStatus: "unavailable",
          };
        }
        return {
          ...provider,
          distanceKm: metric.distanceKm,
          routeDurationMin: metric.durationMin,
          routeSource: metric.source,
          routeStatus: "routed",
        };
      }));
    });

    return () => {
      active = false;
    };
  }, [routeCandidateKey, userLat, userLng]);

  useEffect(() => {
    if (!selectedProvider) return;
    const refreshed = allProviders.find((provider) => provider.id === selectedProvider.id);
    if (refreshed && refreshed !== selectedProvider) setSelectedProvider(refreshed);
  }, [allProviders, selectedProvider]);

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
      return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
    });

    return list;
  }, [filtered, sortBy]);

  const focusProvider = (provider: ExtendedProvider) => {
    // Selecting a worker must never replace the customer's service address with
    // the provider's profile coordinates.
    setSelectedProvider(provider);
  };

  const resolveAddressFromCoords = async (
    latitude: number,
    longitude: number
  ): Promise<string> => {
    try {
      setResolvingAddress(true);
      const resolved = (await reverseGeocode(latitude, longitude)) || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
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

  const handleCoordinateChange = async (latitude: number, longitude: number) => {
    setLocationAccuracyMeters(null);
    setPickedLocation({ latitude, longitude });
    setUserLat(latitude);
    setUserLng(longitude);
    const resolvedAddress = await resolveAddressFromCoords(latitude, longitude);
    if (providerId) navigateBackToBooking(latitude, longitude, resolvedAddress);
  };

  const applyLocationSelection = (selection: LocationSelection) => {
    setLocationAccuracyMeters(selection.accuracy ?? null);
    setPickedLocation({ latitude: selection.latitude, longitude: selection.longitude });
    setPickedAddress(selection.address);
    setUserLat(selection.latitude);
    setUserLng(selection.longitude);
    setShowMap(true);
  };

  const openSelectedProvider = () => {
    if (!selectedProvider) return;
    router.push({
      pathname: "/(customer)/provider-detail",
      params: { providerId: selectedProvider.id, serviceId: selectedService || undefined },
    });
  };

  const bookSelectedProvider = () => {
    if (!selectedProvider) return;

    router.replace({
      pathname: "/(customer)/book-service",
      params: {
        providerId: selectedProvider.id,
        serviceId: selectedService || undefined,
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

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}>
      <LocationSearchPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onSelect={applyLocationSelection}
        bias={pickedLocation || (userLat != null && userLng != null ? { latitude: userLat, longitude: userLng } : null)}
        savedLocations={savedLocations}
        title="Choose service location"
        onChooseOnMap={() => setShowMap(true)}
      />
      {locationError ? (
        <View style={{ marginHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ color: theme.colors.danger, fontSize: 12, fontWeight: "700" }}>{locationError}</Text>
        </View>
      ) : null}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { backgroundColor: theme.colors.input, borderColor: theme.colors.border }]}>
            <Icon name="search" size={17} color={theme.colors.textMuted} />
            <TextInput
              style={[styles.searchInput, localizedText, { color: theme.colors.text }]}
              placeholder={t.searchPlaceholder}
              value={query}
              onChangeText={setQuery}
              placeholderTextColor={theme.colors.textMuted}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery("")}>
                <Icon name="x" size={16} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.mapToggle, showMap && styles.mapToggleActive]}
            onPress={() => setShowMap(!showMap)}
          >
            <Icon name="map" size={20} color={showMap ? theme.colors.onBrand : theme.colors.primary} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.cityRow}>
            {cities.map((c) => (
              <Pressable
                key={c === "All Areas" ? t.allAreas : c}
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
              { label: tr("Recommended"), value: "recommended" as const },
              { label: tr("Nearest"), value: "nearby" as const },
              { label: tr("Top Rated"), value: "rating" as const },
              { label: tr("Most Jobs"), value: "jobs" as const },
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("Search for a service location")}
            onPress={() => setLocationPickerVisible(true)}
            style={[styles.mapLocationSearch, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <Icon name="search" size={18} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.mapLocationSearchText, localizedText, { color: pickedAddress ? theme.colors.text : theme.colors.textMuted }]}>
                {pickedAddress || tr("Search street, area, landmark or city")}
              </Text>
              <Text style={[styles.mapLocationSearchHint, localizedText, { color: theme.colors.textSecondary }]}>
                {locationAccuracyMeters != null
                  ? `${tr("GPS accuracy")} Â±${Math.round(locationAccuracyMeters)} m`
                  : tr("GPS, saved places and map pin")}
              </Text>
            </View>
            <Icon name="chevron-right" size={17} color={theme.colors.textMuted} />
          </Pressable>
          {Platform.OS === "web" ? (
            <View
              style={[
                styles.mapBg,
                { alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.infoSoft },
              ]}
            >
              <Icon name="map-pin" size={40} color={theme.colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text, marginTop: 12 }}>
                {tr("Map available in mobile app")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
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
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.mapLoaderText}>Loading nearby workers...</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <AthooMapFallback
                latitude={pickedLocation?.latitude ?? userLat}
                longitude={pickedLocation?.longitude ?? userLng}
                draggable={pickAddress === "1" || Boolean(providerId)}
                onCoordinateChange={(latitude, longitude) => void handleCoordinateChange(latitude, longitude)}
              />

              <Pressable style={styles.locateMeBtn} onPress={() => void handleLocateMe(true)}>
                {locating ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon
                    name="navigation"
                    size={20}
                    color={userLat ? theme.colors.primary : theme.colors.textSecondary}
                  />
                )}
              </Pressable>
            </View>
          )}

          {!!pickedLocation && (
            <View style={styles.pickedAddressBar}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickedAddressLabel, localizedText]}>{tr("Selected Address")}</Text>
                <Text style={styles.pickedAddressText} numberOfLines={2}>
                  {resolvingAddress ? tr("Getting address...") : pickedAddress || tr("Picked from map")}
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
                    {selectedProvider.routeStatus === "pending"
                      ? "Calculating road routeâ€¦"
                      : typeof selectedProvider.distanceKm === "number"
                        ? `${selectedProvider.distanceKm.toFixed(1)} km by road${
                            selectedProvider.routeDurationMin != null
                              ? ` â€¢ ${Math.round(selectedProvider.routeDurationMin)} min`
                              : ""
                          }`
                        : "Road route unavailable"}
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
                    const serviceLabels = (p.services || []).map((service: string) => getCategoryBySlug(service)?.name || service).filter(Boolean);
                    const svcLabel = serviceLabels.length > 2
                      ? `${serviceLabels.slice(0, 2).join(" • ")} • +${serviceLabels.length - 2}`
                      : serviceLabels.join(" • ") || "Service";
                    const color = p.profileColor || theme.colors.primary;
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
                          <Icon name="star" size={10} color={theme.colors.accent} />
                          <Text style={styles.mapProviderRatingText}>{rating}</Text>
                        </View>

                        <Text style={styles.mapProviderPrice}>{rateLabel}</Text>

                        {p.routeStatus === "pending" ? (
                          <Text style={styles.mapProviderDistance}>Routeâ€¦</Text>
                        ) : typeof p.distanceKm === "number" ? (
                          <Text style={styles.mapProviderDistance}>
                            {p.distanceKm.toFixed(1)} km road
                            {p.routeDurationMin != null ? ` â€¢ ${Math.round(p.routeDurationMin)} min` : ""}
                          </Text>
                        ) : null}
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
              <Icon name="sparkles" size={15} color={theme.colors.primary} />
              <Text style={styles.matchHintText}>Matching {categoryMatches.slice(0, 3).map((category) => category.name).join(", ")}</Text>
            </View>
          )}

          {!query && (
            <AnimatedCard delay={60}>
              <View style={styles.servicesSection}>
                <Text style={styles.sectionLabel}>Browse by Service</Text>
                <View style={styles.servicesGrid}>
                  {categories.map((s) => {
                    const appearance = getCategoryAppearance(s, theme);
                    const selected = selectedService === s.slug;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setSelectedService(selected ? null : s.slug)}
                        style={[
                          styles.serviceGridItem,
                          selected && {
                            backgroundColor: appearance.selectedBackground,
                            borderColor: appearance.accent,
                          },
                        ]}
                      >
                        <Icon
                          name={s.icon as any}
                          size={18}
                          color={selected ? appearance.accent : theme.colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.serviceGridText,
                            selected && { color: appearance.accent },
                          ]}
                        >
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
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
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingListText}>Loading workers...</Text>
            </View>
          ) : sorted.length === 0 ? (
            <AnimatedCard>
              <View style={styles.emptyState}>
                <Icon name="search" size={36} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>{isUrdu ? "کوئی ملازم نہیں ملا" : "No workers found"}</Text>
                <Text style={styles.emptySubtitle}>{isUrdu ? "مختلف تلاش یا خدمت آزمائیں" : "Try a different search or service"}</Text>
              </View>
            </AnimatedCard>
          ) : (
            sorted.map((p, i) => (
              <AnimatedCard key={p.id} delay={80 + i * 50}>
                <View style={styles.listCardWrap}>
                  {p.routeStatus === "pending" ? (
                    <View style={styles.distanceBadge}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={styles.distanceBadgeText}>Calculating routeâ€¦</Text>
                    </View>
                  ) : typeof p.distanceKm === "number" ? (
                    <View style={styles.distanceBadge}>
                      <Icon name="navigation" size={11} color={theme.colors.primary} />
                      <Text style={styles.distanceBadgeText}>
                        {p.distanceKm.toFixed(1)} km by road
                        {p.routeDurationMin != null ? ` â€¢ ${Math.round(p.routeDurationMin)} min` : ""}
                      </Text>
                    </View>
                  ) : null}

                  <ProviderCard
                    provider={p}
                    onPress={() =>
                      router.push({
                        pathname: "/(customer)/provider-detail",
                        params: { providerId: p.id, serviceId: selectedService || undefined },
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

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingBottom: 12,
    shadowColor: theme.colors.text,
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
    backgroundColor: theme.colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },

  mapToggle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },

  mapToggleActive: { backgroundColor: theme.colors.primary },

  cityRow: { flexDirection: "row", gap: 8 },

  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  cityChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  cityText: { fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary },
  cityTextActive: { color: theme.colors.onBrand },

  sortRow: { flexDirection: "row", gap: 8, paddingTop: 2 },

  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  sortChipActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },

  sortText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },

  sortTextActive: {
    color: theme.colors.onBrand,
  },

  mapContainer: { flex: 1 },
  mapLocationSearch: { position: "absolute", top: 12, left: 14, right: 14, zIndex: 20, minHeight: 58, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, shadowColor: theme.colors.text, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  mapLocationSearchText: { fontSize: 14, fontWeight: "800" },
  mapLocationSearchHint: { marginTop: 2, fontSize: 10 },
  mapBg: { flex: 1 },

  mapLoader: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },

  mapLoaderText: {
    marginTop: 10,
    color: theme.colors.textSecondary,
  },

  locateMeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },

  pickedAddressBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  pickedAddressLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
    marginBottom: 2,
  },

  pickedAddressText: {
    fontSize: 12,
    color: theme.colors.text,
    lineHeight: 17,
  },

  useAddressBtn: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  useAddressBtnText: {
    color: theme.colors.onBrand,
    fontWeight: "700",
    fontSize: 12,
  },

  mapBottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 8,
    gap: 12,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },

  mapHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: "center",
  },

  mapCount: { fontSize: 14, fontWeight: "700", color: theme.colors.text },

  selectedProviderBox: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },

  selectedProviderName: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
  },

  selectedProviderMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 3,
  },

  selectedButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },

  profileBtn: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  profileBtnText: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 13,
  },

  bookBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },

  bookBtnText: {
    color: theme.colors.onBrand,
    fontWeight: "700",
    fontSize: 13,
  },

  mapProviderRow: { flexDirection: "row", gap: 12 },

  mapProviderCard: {
    width: 108,
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  mapProviderCardActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },

  mapProviderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },

  mapProviderAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.primary,
  },

  mapProviderName: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },

  mapProviderService: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },

  mapProviderRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  mapProviderRatingText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.text,
  },

  mapProviderPrice: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
    textAlign: "center",
  },

  mapProviderDistance: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },

  viewListBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },

  viewListText: {
    color: theme.colors.onBrand,
    fontWeight: "700",
    fontSize: 14,
  },

  scroll: { flex: 1 },
  matchHint: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.primary + "33" },
  matchHintText: { flex: 1, color: theme.colors.primaryPressed, fontSize: 13, fontWeight: "700" },

  scrollContent: { padding: 20, paddingBottom: 100 },

  servicesSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },

  serviceGridText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },

  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  resultCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  loadingListWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },

  loadingListText: {
    marginTop: 10,
    color: theme.colors.textSecondary,
  },

  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 60,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
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

  distanceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
  },
});
