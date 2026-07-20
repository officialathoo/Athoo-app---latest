import { LocationSearchPicker, type LocationSelection, type SavedLocationOption } from "@/components/maps/LocationSearchPicker";
import { OpenStreetMapPreview } from "@/components/maps/OpenStreetMapPreview";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Icon } from "@/components/ui/Icon";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { useCategories } from "@/context/CategoriesContext";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";
import { Provider } from "@/data/services";
import { apiErrorToMessage } from "@/lib/apiError";
import { api } from "@/services/api";
import { getFastForegroundLocation } from "@/services/location";
import { reverseGeocode } from "@/services/maps";
import { getDistanceKm } from "@/utils/distance";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Coordinate = { latitude: number; longitude: number };

type ExtendedProvider = Provider & Coordinate & { distanceKm?: number };

function isValidMapCoord(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export default function CustomerMapScreen() {
  const { serviceId, providerId, returnTo } = useLocalSearchParams<{
    serviceId?: string;
    providerId?: string;
    returnTo?: string;
  }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { translate: tr, textAlign, writingDirection } = useLang();
  const { getCategoryBySlug } = useCategories();

  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ExtendedProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ExtendedProvider | null>(null);
  const [pickedLocation, setPickedLocation] = useState<Coordinate | null>(null);
  const [pickedAddress, setPickedAddress] = useState("");
  const [resolving, setResolving] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocationOption[]>([]);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const canPickLocation = Boolean(providerId || returnTo);
  const distanceOrigin = pickedLocation || userLocation;

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [locationResult, providerResponse, addressResponse] = await Promise.all([
          getFastForegroundLocation({
            timeoutMs: 12_000,
            maxCacheAgeMs: 5 * 60 * 1000,
            requiredAccuracy: 60,
            freshAccuracy: "highest",
            rationaleTitle: tr("Location permission"),
            rationaleBody: tr("Athoo uses your location to show nearby providers and let you choose an accurate service address."),
          }),
          api.getProviders(serviceId && serviceId !== "all" ? serviceId : undefined),
          api.getAddresses().catch(() => ({ addresses: [] })),
        ]);
        if (!alive) return;

        const currentCoords = locationResult.location
          ? { latitude: locationResult.location.latitude, longitude: locationResult.location.longitude }
          : null;
        if (currentCoords) setUserLocation(currentCoords);

        const raw = (providerResponse.providers as Provider[]) || [];
        const mapped: ExtendedProvider[] = raw.flatMap((provider) => {
          const rawLat = (provider as any).latitude ?? (provider as any).lat;
          const rawLng = (provider as any).longitude ?? (provider as any).lng;
          const latitude = typeof rawLat === "number" ? rawLat : Number(rawLat);
          const longitude = typeof rawLng === "number" ? rawLng : Number(rawLng);
          if (!isValidMapCoord(latitude, longitude)) return [];
          return [{ ...(provider as Provider), latitude, longitude } as ExtendedProvider];
        });

        setProviders(mapped);
        const requestedProvider = providerId ? mapped.find((provider) => provider.id === providerId) || null : null;
        setSelectedProvider(requestedProvider || mapped[0] || null);
        setSavedLocations(
          Array.isArray((addressResponse as any)?.addresses)
            ? (addressResponse as any).addresses.map((address: any) => ({
                id: String(address.id),
                label: String(address.label || tr("Saved address")),
                address: String(address.address || ""),
                latitude: address.latitude == null ? null : Number(address.latitude),
                longitude: address.longitude == null ? null : Number(address.longitude),
              }))
            : [],
        );
      } catch (error) {
        if (alive) setLoadError(apiErrorToMessage(error, tr("The map could not be loaded. Please try again.")));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [providerId, reloadKey, serviceId, tr]);

  const providersWithDistance = useMemo(
    () => providers.map((provider) => ({
      ...provider,
      distanceKm: distanceOrigin
        ? getDistanceKm(distanceOrigin.latitude, distanceOrigin.longitude, provider.latitude, provider.longitude)
        : undefined,
    })),
    [distanceOrigin, providers],
  );

  const sortedProviders = useMemo(
    () => [...providersWithDistance].sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)),
    [providersWithDistance],
  );

  const visibleProviders = useMemo(
    () => sortedProviders.filter((provider) => isValidMapCoord(provider.latitude, provider.longitude)).slice(0, 80),
    [sortedProviders],
  );

  useEffect(() => {
    if (!selectedProvider) return;
    const refreshed = providersWithDistance.find((provider) => provider.id === selectedProvider.id);
    if (refreshed) setSelectedProvider(refreshed);
  }, [providersWithDistance, selectedProvider?.id]);

  const selectedCategory = getCategoryBySlug(serviceId || "");

  const resolveAddress = useCallback(async (latitude: number, longitude: number) => {
    setResolving(true);
    try {
      const resolved = await reverseGeocode(latitude, longitude);
      setPickedAddress(resolved || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } catch {
      setPickedAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } finally {
      setResolving(false);
    }
  }, []);

  const applySelection = useCallback((selection: LocationSelection) => {
    const coordinates = { latitude: selection.latitude, longitude: selection.longitude };
    setPickedLocation(coordinates);
    setPickedAddress(selection.address);
  }, []);

  const handleUsePickedLocation = () => {
    if (!pickedLocation) return;
    router.replace({
      pathname: "/(customer)/book-service",
      params: {
        ...(providerId ? { providerId } : {}),
        ...(serviceId ? { serviceId } : {}),
        pickedAddress: pickedAddress || tr("Pinned location"),
        pickedLat: String(pickedLocation.latitude),
        pickedLng: String(pickedLocation.longitude),
      },
    } as any);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: theme.colors.background }]}> 
      <LocationSearchPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onSelect={applySelection}
        bias={distanceOrigin}
        savedLocations={savedLocations}
        title="Choose service location"
        onChooseOnMap={() => {
          if (!pickedLocation && userLocation) {
            setPickedLocation(userLocation);
            void resolveAddress(userLocation.latitude, userLocation.longitude);
          }
        }}
      />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Back")}
          style={[styles.iconBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <Icon name="arrow-left" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.text, textAlign, writingDirection }]}>{selectedCategory?.name || tr("Service Map")}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>
            {canPickLocation ? tr("Search, use GPS, or place the pin") : `${sortedProviders.length} ${tr("providers on map")}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("Use current location")}
          style={[styles.iconBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => {
            if (userLocation) {
              setPickedLocation(userLocation);
              void resolveAddress(userLocation.latitude, userLocation.longitude);
            } else {
              setLocationPickerVisible(true);
            }
          }}
        >
          <Icon name="crosshair" size={18} color={theme.colors.primary} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("Search for a service location")}
        onPress={() => setLocationPickerVisible(true)}
        style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <Icon name="search" size={19} color={theme.colors.primary} />
        <View style={styles.searchTextWrap}>
          <Text numberOfLines={1} style={[styles.searchPrimary, { color: pickedAddress ? theme.colors.text : theme.colors.textMuted, textAlign, writingDirection }]}>
            {pickedAddress || tr("Search street, area, landmark or city")}
          </Text>
          {pickedAddress ? (
            <Text style={[styles.searchSecondary, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{tr("Tap to change location")}</Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
      </Pressable>

      <View style={[styles.mapWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>{tr("Loading map...")}</Text>
          </View>
        ) : (
          <OpenStreetMapPreview
            latitude={pickedLocation?.latitude ?? selectedProvider?.latitude ?? userLocation?.latitude}
            longitude={pickedLocation?.longitude ?? selectedProvider?.longitude ?? userLocation?.longitude}
            markers={[
              ...visibleProviders.map((provider) => ({
                id: `provider-${provider.id}`,
                latitude: provider.latitude,
                longitude: provider.longitude,
                kind: "provider" as const,
                label: provider.name,
              })),
              ...(userLocation ? [{ id: "customer-location", ...userLocation, kind: "customer" as const }] : []),
              ...(pickedLocation ? [{ id: "picked-location", ...pickedLocation, kind: "selected" as const }] : []),
            ]}
            interactive={canPickLocation}
            onCoordinateChange={(latitude, longitude) => {
              setPickedLocation({ latitude, longitude });
              void resolveAddress(latitude, longitude);
            }}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        {loadError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger }]}> 
            <Text style={[styles.errorText, { color: theme.colors.danger, textAlign, writingDirection }]}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={() => setReloadKey((value) => value + 1)} style={styles.retryButton}>
              <Text style={[styles.retryText, { color: theme.colors.danger }]}>{tr("Retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {canPickLocation ? (
          <AnimatedCard>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
              <Text style={[styles.cardTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("Selected service address")}</Text>
              <Text style={[styles.cardText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>
                {resolving ? tr("Getting address...") : pickedAddress || tr("Search for an address or tap the map to place the pin.")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !pickedLocation }}
                style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }, !pickedLocation && styles.disabledBtn]}
                onPress={handleUsePickedLocation}
                disabled={!pickedLocation}
              >
                <Text style={styles.primaryBtnText}>{tr("Use This Location")}</Text>
              </Pressable>
            </View>
          </AnimatedCard>
        ) : null}

        {selectedProvider ? (
          <AnimatedCard delay={80}>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
              <Text style={[styles.cardTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("Selected Provider")}</Text>
              <ProviderCard
                provider={selectedProvider as any}
                distanceText={selectedProvider.distanceKm != null ? `${selectedProvider.distanceKm.toFixed(1)} km ${tr("away")}` : undefined}
                rightAction={
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.viewBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => router.push({ pathname: "/(customer)/provider-detail", params: { providerId: selectedProvider.id } } as any)}
                  >
                    <Text style={styles.viewBtnText}>{tr("View")}</Text>
                  </Pressable>
                }
              />
            </View>
          </AnimatedCard>
        ) : null}

        {!providerId ? (
          <AnimatedCard delay={120}>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
              <Text style={[styles.cardTitle, { color: theme.colors.text, textAlign, writingDirection }]}>{tr("Nearby Providers")}</Text>
              {sortedProviders.slice(0, 6).map((provider) => (
                <Pressable key={provider.id} accessibilityRole="button" onPress={() => setSelectedProvider(provider)}>
                  <ProviderCard
                    provider={provider as any}
                    distanceText={provider.distanceKm != null ? `${provider.distanceKm.toFixed(1)} km ${tr("away")}` : undefined}
                  />
                </Pressable>
              ))}
              {!loading && sortedProviders.length === 0 ? (
                <Text style={[styles.cardText, { color: theme.colors.textSecondary, textAlign, writingDirection }]}>{tr("No providers with valid map coordinates were found for this area.")}</Text>
              ) : null}
            </View>
          </AnimatedCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AthooTheme) => StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  headerText: { flex: 1 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { marginTop: 2, fontSize: 13 },
  searchBar: { marginHorizontal: 16, minHeight: 58, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, marginBottom: 12 },
  searchTextWrap: { flex: 1 },
  searchPrimary: { fontSize: 14, fontWeight: "700" },
  searchSecondary: { marginTop: 2, fontSize: 11 },
  mapWrap: { marginHorizontal: 16, borderRadius: 18, overflow: "hidden", borderWidth: 1, height: 300 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13 },
  errorBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  errorText: { flex: 1, fontSize: 13, fontWeight: "600" },
  retryButton: { minHeight: 40, minWidth: 64, alignItems: "center", justifyContent: "center" },
  retryText: { fontSize: 13, fontWeight: "800" },
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardText: { fontSize: 14, lineHeight: 20 },
  primaryBtn: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: theme.colors.white, fontSize: 15, fontWeight: "800" },
  viewBtn: { minWidth: 62, paddingHorizontal: 14, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  viewBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 13 },
});
