import { AthooMapFallback } from "@/components/maps/AthooMapFallback";
import { Icon } from "@/components/ui/Icon";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { Colors } from "@/constants/colors";
import { Provider } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { getDistanceKm } from "@/utils/distance";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { reverseGeocodeGoogle } from "@/services/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ExtendedProvider = Provider & {
  latitude: number;
  longitude: number;
  distanceKm?: number;
};

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

function isValidMapCoord(latitude: number, longitude: number) {
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
  const mapRef = useRef<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ExtendedProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ExtendedProvider | null>(null);
  const [pickedLocation, setPickedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickedAddress, setPickedAddress] = useState("");
  const [resolving, setResolving] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoadError("");
        const permission = await Location.requestForegroundPermissionsAsync();
        const status = permission.status;
        if (alive) setLocationGranted(status === "granted");
        let currentCoords: { latitude: number; longitude: number } | null = null;

        if (status === "granted") {
          const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 1000 }).catch(() => null);
          const loc = lastKnown || await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Location request timed out")), 12000)),
          ]);
          currentCoords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          if (alive) setUserLocation(currentCoords);
        }

        const res = await api.getProviders(serviceId && serviceId !== "all" ? serviceId : undefined);
        const raw = (res.providers as Provider[]) || [];

        const mapped: ExtendedProvider[] = raw.flatMap((p) => {
          const rawLat = (p as any).latitude ?? (p as any).lat;
          const rawLng = (p as any).longitude ?? (p as any).lng;
          const parsedLat = typeof rawLat === "number" ? rawLat : typeof rawLat === "string" ? Number(rawLat) : NaN;
          const parsedLng = typeof rawLng === "number" ? rawLng : typeof rawLng === "string" ? Number(rawLng) : NaN;
          if (!isValidMapCoord(parsedLat, parsedLng)) return [];
          return [{
            ...(p as Provider),
            latitude: parsedLat,
            longitude: parsedLng,
            distanceKm: currentCoords
              ? getDistanceKm(currentCoords.latitude, currentCoords.longitude, parsedLat, parsedLng)
              : undefined,
          } as ExtendedProvider];
        });

        if (!alive) return;

        setProviders(mapped);
        if (providerId) {
          const found = mapped.find((p) => p.id === providerId) || null;
          setSelectedProvider(found);
        } else {
          setSelectedProvider(mapped[0] || null);
        }

        const initialRegion: Region = currentCoords
          ? {
              latitude: currentCoords.latitude,
              longitude: currentCoords.longitude,
              latitudeDelta: 0.09,
              longitudeDelta: 0.09,
            }
          : {
              latitude: mapped[0]?.latitude || 33.6844,
              longitude: mapped[0]?.longitude || 73.0479,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            };

        setTimeout(() => {
          mapRef.current?.animateToRegion(initialRegion, 500);
        }, 80);
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Map could not be loaded");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [serviceId, providerId]);

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
  }, [providers]);

  const visibleProviders = useMemo(() => {
    return sortedProviders.filter((p) => isValidMapCoord(p.latitude, p.longitude)).slice(0, 80);
  }, [sortedProviders]);

  const { getCategoryBySlug } = useCategories();
  const selectedCategory = getCategoryBySlug(serviceId || "");

  async function resolveAddress(latitude: number, longitude: number) {
    setResolving(true);
    try {
      const resolved = await reverseGeocodeGoogle(latitude, longitude);
      setPickedAddress(resolved || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } catch {
      setPickedAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } finally {
      setResolving(false);
    }
  }

  const handleMapPress = async (event: any) => {
    const coords = event?.nativeEvent?.coordinate;
    if (!coords) return;
    setPickedLocation(coords);
    await resolveAddress(coords.latitude, coords.longitude);
  };

  const handleUsePickedLocation = () => {
    if (!providerId || !pickedLocation) return;

    router.replace({
      pathname: returnTo === "book-service" ? "/(customer)/book-service" : "/(customer)/book-service",
      params: {
        providerId,
        pickedAddress: pickedAddress || "Pinned location",
        pickedLat: String(pickedLocation.latitude),
        pickedLng: String(pickedLocation.longitude),
      },
    } as any);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}> 
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{selectedCategory?.name || "Service Map"}</Text>
          <Text style={styles.subtitle}>
            {providerId ? "Choose an address and return to booking" : `${sortedProviders.length} providers on map`}
          </Text>
        </View>
        {userLocation ? (
          <Pressable
            style={styles.iconBtn}
            onPress={() => {
              mapRef.current?.animateToRegion(
                {
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
                },
                450
              );
            }}
          >
            <Icon name="crosshair" size={18} color={Colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.mapWrap}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        ) : (
          <AthooMapFallback latitude={pickedLocation?.latitude ?? selectedProvider?.latitude ?? userLocation?.latitude} longitude={pickedLocation?.longitude ?? selectedProvider?.longitude ?? userLocation?.longitude} draggable={!!returnTo} showsUserLocation={locationGranted} onCoordinateChange={(latitude, longitude) => { setPickedLocation({ latitude, longitude }); void resolveAddress(latitude, longitude); }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loadError ? <View style={styles.errorBanner}><Text style={styles.errorText}>{loadError}</Text></View> : null}
        {providerId ? (
          <AnimatedCard>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Picked Address</Text>
              <Text style={styles.cardText}>
                {resolving ? "Getting address..." : pickedAddress || "Tap anywhere on the map to select address."}
              </Text>
              <Pressable
                style={[styles.primaryBtn, !pickedLocation && styles.disabledBtn]}
                onPress={handleUsePickedLocation}
                disabled={!pickedLocation}
              >
                <Text style={styles.primaryBtnText}>Use This Location</Text>
              </Pressable>
            </View>
          </AnimatedCard>
        ) : null}

        {selectedProvider ? (
          <AnimatedCard delay={80}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Selected Provider</Text>
              <ProviderCard
                provider={selectedProvider as any}
                distanceText={selectedProvider.distanceKm ? `${selectedProvider.distanceKm.toFixed(1)} km away` : undefined}
                rightAction={
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/(customer)/provider-detail",
                        params: { providerId: selectedProvider.id },
                      } as any)
                    }
                  >
                    <Text style={styles.viewBtnText}>View</Text>
                  </Pressable>
                }
              />
            </View>
          </AnimatedCard>
        ) : null}

        {!providerId ? (
          <AnimatedCard delay={120}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Nearby Providers</Text>
              {sortedProviders.slice(0, 6).map((provider) => (
                <Pressable key={provider.id} onPress={() => setSelectedProvider(provider)}>
                  <ProviderCard
                    provider={provider as any}
                    distanceText={provider.distanceKm ? `${provider.distanceKm.toFixed(1)} km away` : undefined}
                  />
                </Pressable>
              ))}
            </View>
          </AnimatedCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle: { marginTop: 2, fontSize: 13, color: Colors.textSecondary },
  mapWrap: {
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    height: 300,
  },
  map: { flex: 1 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
  errorBanner: { backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: "#B91C1C", fontSize: 13, fontWeight: "600" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  cardText: { fontSize: 14, lineHeight: 20, color: Colors.textSecondary },
  primaryBtn: {
    backgroundColor: Colors.primary,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  viewBtn: {
    minWidth: 62,
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  viewBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});

