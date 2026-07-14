import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useTheme } from "@/context/ThemeContext";

type Props = {
  latitude?: number;
  longitude?: number;
  draggable?: boolean;
  onCoordinateChange?: (latitude: number, longitude: number) => void;
  showsUserLocation?: boolean;
};

function validCoordinate(value: number | undefined, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function AthooMapFallback({
  latitude,
  longitude,
  draggable = false,
  onCoordinateChange,
  showsUserLocation = false,
}: Props) {
  const { theme } = useTheme();
  const [nativeFailed, setNativeFailed] = useState(false);
  const googleMapsApiKey = String(Constants.expoConfig?.extra?.googleMapsApiKey || "").trim();
  const nativeMapConfigured = Platform.OS !== "android" || googleMapsApiKey.length > 0;
  const coordinate = useMemo(() => ({
    latitude: validCoordinate(latitude, -90, 90) ? latitude : 30.3753,
    longitude: validCoordinate(longitude, -180, 180) ? longitude : 69.3451,
  }), [latitude, longitude]);

  if (Platform.OS === "web" || nativeFailed || !nativeMapConfigured) {
    return (
      <View style={[styles.fallback, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Map preview is unavailable right now.</Text>
        <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
          {!nativeMapConfigured
            ? "Google Maps is not configured for this Android build. You can still continue using the selected address and coordinates."
            : "You can still continue using the selected address and coordinates."}
        </Text>
        {nativeFailed && nativeMapConfigured ? (
          <Pressable onPress={() => setNativeFailed(false)} style={[styles.retry, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.retryText}>Retry Map</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  try {
    // Keep the native module behind a guarded runtime require. This prevents a
    // missing/failed native map module from crashing the entire route.
    const maps = require("react-native-maps") as typeof import("react-native-maps");
    const MapView = maps.default;
    const Marker = maps.Marker;
    return (
      <MapView
        style={styles.map}
        initialRegion={{ ...coordinate, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={showsUserLocation}
        onMapReady={() => undefined}
        onMapLoaded={() => undefined}
        onPress={(event) => {
          if (!draggable) return;
          const next = event.nativeEvent.coordinate;
          if (validCoordinate(next?.latitude, -90, 90) && validCoordinate(next?.longitude, -180, 180)) {
            onCoordinateChange?.(next.latitude, next.longitude);
          }
        }}
      >
        <Marker
          coordinate={coordinate}
          draggable={draggable}
          onDragEnd={(event) => {
            const next = event.nativeEvent.coordinate;
            if (validCoordinate(next?.latitude, -90, 90) && validCoordinate(next?.longitude, -180, 180)) {
              onCoordinateChange?.(next.latitude, next.longitude);
            }
          }}
        />
      </MapView>
    );
  } catch {
    // Render fallback on the next pass instead of allowing a native-module
    // initialization failure to terminate the app.
    queueMicrotask(() => setNativeFailed(true));
    return null;
  }
}

const styles = StyleSheet.create({
  map: { width: "100%", height: 220, borderRadius: 16 },
  fallback: { minHeight: 220, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  body: { fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  retry: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
