import { isRunningInExpoGo } from "expo";
import React, { Component, useEffect, useMemo, useRef, type ErrorInfo, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Icon } from "@/components/ui/Icon";
import { OpenStreetMapPreview, type OpenMapMarker } from "@/components/maps/OpenStreetMapPreview";
import { useSettings } from "@/context/SettingsContext";
import { useTheme } from "@/context/ThemeContext";
import type { AthooTheme } from "@/design/theme";

export type AthooMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type AthooInteractiveMarker = AthooMapCoordinate & {
  id: string;
  label?: string;
  kind?: "provider" | "customer" | "job";
  color?: string;
};

type Props = {
  focusCoordinate?: AthooMapCoordinate | null;
  selectedCoordinate?: AthooMapCoordinate | null;
  userCoordinate?: AthooMapCoordinate | null;
  providerMarkers?: AthooInteractiveMarker[];
  routePolyline?: AthooMapCoordinate[];
  selectedProviderId?: string | null;
  editable?: boolean;
  onCoordinateChange?: (latitude: number, longitude: number) => void;
  onProviderPress?: (providerId: string) => void;
  height?: number;
};

const PAKISTAN_VIEWPORT: AthooMapCoordinate = {
  latitude: 30.3753,
  longitude: 69.3451,
};

function validCoordinate(value: AthooMapCoordinate | null | undefined): value is AthooMapCoordinate {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

function extractLngLat(event: any): AthooMapCoordinate | null {
  const lngLat = event?.nativeEvent?.lngLat;
  if (!Array.isArray(lngLat) || lngLat.length < 2) return null;
  const longitude = Number(lngLat[0]);
  const latitude = Number(lngLat[1]);
  const coordinate = { latitude, longitude };
  return validCoordinate(coordinate) ? coordinate : null;
}

function boundsFor(points: AthooMapCoordinate[]): [number, number, number, number] | null {
  const valid = points.filter(validCoordinate);
  if (valid.length < 2) return null;
  const longitudes = valid.map((point) => point.longitude);
  const latitudes = valid.map((point) => point.latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  if (west === east && south === north) return null;
  return [west, south, east, north];
}

function fallbackMarkers(
  selectedCoordinate: AthooMapCoordinate | null | undefined,
  userCoordinate: AthooMapCoordinate | null | undefined,
  providerMarkers: AthooInteractiveMarker[],
): OpenMapMarker[] {
  const markers: OpenMapMarker[] = [];
  if (validCoordinate(selectedCoordinate)) {
    markers.push({ ...selectedCoordinate, id: "selected-location", kind: "selected" });
  }
  if (validCoordinate(userCoordinate)) {
    markers.push({ ...userCoordinate, id: "live-user", kind: "customer" });
  }
  for (const marker of providerMarkers) {
    if (validCoordinate(marker)) markers.push({ ...marker, kind: "provider" });
  }
  return markers;
}

type NativeMapBoundaryProps = {
  fallback: ReactNode;
  children: ReactNode;
};

type NativeMapBoundaryState = {
  failed: boolean;
};

class NativeMapErrorBoundary extends Component<
  NativeMapBoundaryProps,
  NativeMapBoundaryState
> {
  state: NativeMapBoundaryState = { failed: false };

  static getDerivedStateFromError(): NativeMapBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.warn(
        "Athoo native map is unavailable in this installed binary; using the compatible map preview.",
        error,
        info.componentStack,
      );
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

let cachedNativeMapLibre: any | null | undefined;

function resolveNativeMapLibre(): any | null {
  if (Platform.OS === "web" || isRunningInExpoGo()) return null;
  if (cachedNativeMapLibre !== undefined) return cachedNativeMapLibre;

  try {
    const candidate = require("@maplibre/maplibre-react-native");
    const requiredExports = [
      "Map",
      "Camera",
      "RasterSource",
      "GeoJSONSource",
      "Layer",
      "ViewAnnotation",
    ];

    cachedNativeMapLibre = requiredExports.every(
      (exportName) => Boolean(candidate?.[exportName]),
    )
      ? candidate
      : null;
  } catch {
    cachedNativeMapLibre = null;
  }

  return cachedNativeMapLibre;
}

export function AthooInteractiveMap({
  focusCoordinate,
  selectedCoordinate,
  userCoordinate,
  providerMarkers = [],
  routePolyline = [],
  selectedProviderId,
  editable = false,
  onCoordinateChange,
  onProviderPress,
  height,
}: Props) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { height: windowHeight } = useWindowDimensions();
  const cameraRef = useRef<any>(null);
  const mapSettings = settings.map;
  const tileUrl = String(mapSettings.tileUrl || "").trim();
  const attribution = String(mapSettings.attribution || "Â© OpenStreetMap contributors").trim();
  const tileSize = mapSettings.tileSize === 512 ? 512 : 256;
  const tileConfigured = ["{z}", "{x}", "{y}"].every((token) => tileUrl.includes(token));
  const safeProviders = useMemo(
    () => providerMarkers.filter(validCoordinate).slice(0, 30),
    [providerMarkers],
  );
  const safeRoute = useMemo(() => routePolyline.filter(validCoordinate), [routePolyline]);
  const resolvedFocus = validCoordinate(focusCoordinate)
    ? focusCoordinate
    : validCoordinate(selectedCoordinate)
      ? selectedCoordinate
      : validCoordinate(userCoordinate)
        ? userCoordinate
        : PAKISTAN_VIEWPORT;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const fallbackHeight = height ?? Math.max(320, Math.round(windowHeight * 0.58));

  // The JavaScript package may arrive through EAS Update before an installed
  // binary contains MapLibre. Resolve it defensively and retain the compatible
  // preview instead of crashing an older native runtime.
  const NativeMapLibre = resolveNativeMapLibre();

  const cameraSignature = useMemo(() => {
    const routeStart = safeRoute[0];
    const routeEnd = safeRoute[safeRoute.length - 1];
    return [
      resolvedFocus.latitude.toFixed(5),
      resolvedFocus.longitude.toFixed(5),
      routeStart?.latitude.toFixed(5) || "",
      routeStart?.longitude.toFixed(5) || "",
      routeEnd?.latitude.toFixed(5) || "",
      routeEnd?.longitude.toFixed(5) || "",
    ].join(":");
  }, [resolvedFocus.latitude, resolvedFocus.longitude, safeRoute]);

  useEffect(() => {
    if (!NativeMapLibre || !cameraRef.current) return;
    const timer = setTimeout(() => {
      const bounds = boundsFor(safeRoute);
      if (bounds) {
        cameraRef.current?.fitBounds(bounds, {
          padding: { top: 96, right: 48, bottom: 190, left: 48 },
          duration: 650,
          easing: "ease",
        });
        return;
      }
      cameraRef.current?.easeTo({
        center: [resolvedFocus.longitude, resolvedFocus.latitude],
        zoom: 15,
        duration: 450,
        easing: "ease",
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [NativeMapLibre, cameraSignature]);

  const moveCameraTo = (coordinate: AthooMapCoordinate, zoom = 16) => {
    cameraRef.current?.easeTo({
      center: [coordinate.longitude, coordinate.latitude],
      zoom,
      duration: 500,
      easing: "ease",
    });
  };

  const fallbackNotice = !tileConfigured
    ? "Map tiles are temporarily unavailable. Your selected location remains saved."
    : "This installed Athoo version is using the compatible map preview. Update the native app for full pan, pinch zoom and draggable pins.";

  const fallbackMap = (
    <View style={{ height: fallbackHeight }}>
      <OpenStreetMapPreview
        latitude={resolvedFocus.latitude}
        longitude={resolvedFocus.longitude}
        height={fallbackHeight}
        markers={fallbackMarkers(selectedCoordinate, userCoordinate, safeProviders)}
        polyline={safeRoute}
        interactive={editable}
        onCoordinateChange={onCoordinateChange}
      />
      <View pointerEvents="none" style={[styles.nativeNotice, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.nativeNoticeText, { color: theme.colors.textSecondary }]}>
          {fallbackNotice}
        </Text>
      </View>
    </View>
  );

  if (!NativeMapLibre || !tileConfigured) {
    return fallbackMap;
  }

  const {
    Map,
    Camera,
    RasterSource,
    GeoJSONSource,
    Layer,
    ViewAnnotation,
  } = NativeMapLibre;

  const mapStyle = {
    version: 8,
    name: "Athoo raster map",
    sources: {},
    layers: [
      {
        id: "athoo-background",
        type: "background",
        paint: { "background-color": theme.colors.surfaceAlt },
      },
    ],
  };

  const routeGeoJson = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: safeRoute.map((point) => [point.longitude, point.latitude]),
    },
  };

  const handleMapPress = (event: any) => {
    if (!editable || !onCoordinateChange) return;
    const coordinate = extractLngLat(event);
    if (coordinate) onCoordinateChange(coordinate.latitude, coordinate.longitude);
  };

  const handleDragEnd = (event: any) => {
    if (!onCoordinateChange) return;
    const coordinate = extractLngLat(event);
    if (coordinate) onCoordinateChange(coordinate.latitude, coordinate.longitude);
  };

  return (
    <NativeMapErrorBoundary fallback={fallbackMap}>
      <View style={[styles.container, height ? { height } : null]}>
      <Map
        style={styles.map}
        mapStyle={mapStyle}
        androidView="texture"
        dragPan
        touchZoom
        doubleTapZoom
        doubleTapHoldZoom
        touchRotate={false}
        touchPitch={false}
        compass
        compassHiddenFacingNorth
        attribution
        logo={false}
        preferredFramesPerSecond={60}
        onPress={handleMapPress}
      >
        <Camera
          ref={cameraRef}
          minZoom={3}
          maxZoom={19}
          initialViewState={{
            center: [resolvedFocus.longitude, resolvedFocus.latitude],
            zoom: validCoordinate(focusCoordinate) || validCoordinate(selectedCoordinate) || validCoordinate(userCoordinate)
              ? 15
              : 5,
          }}
        />

        <RasterSource
          id="athoo-raster-source"
          tiles={[tileUrl]}
          tileSize={tileSize}
          minzoom={1}
          maxzoom={19}
          attribution={attribution}
        >
          <Layer
            id="athoo-raster-layer"
            type="raster"
            source="athoo-raster-source"
            paint={{
              "raster-opacity": 1,
              "raster-fade-duration": 120,
            }}
          />
        </RasterSource>

        {safeRoute.length >= 2 ? (
          <GeoJSONSource id="athoo-route-source" data={routeGeoJson}>
            <Layer
              id="athoo-route-outline"
              type="line"
              source="athoo-route-source"
              paint={{
                "line-color": theme.colors.surface,
                "line-width": 8,
                "line-opacity": 0.9,
              }}
            />
            <Layer
              id="athoo-route-line"
              type="line"
              source="athoo-route-source"
              paint={{
                "line-color": theme.colors.primary,
                "line-width": 5,
                "line-opacity": 1,
              }}
            />
          </GeoJSONSource>
        ) : null}

        {validCoordinate(userCoordinate) ? (
          <ViewAnnotation id="athoo-live-user" lngLat={[userCoordinate.longitude, userCoordinate.latitude]} anchor="center">
            <View style={[styles.userPulse, { borderColor: theme.colors.surface }]}>
              <View style={[styles.userDot, { backgroundColor: theme.colors.secondary }]} />
            </View>
          </ViewAnnotation>
        ) : null}

        {safeProviders.map((marker) => {
          const selected = marker.id === selectedProviderId;
          const color = marker.color || theme.colors.primary;
          return (
            <ViewAnnotation
              key={marker.id}
              id={`provider-${marker.id}`}
              title={marker.label}
              lngLat={[marker.longitude, marker.latitude]}
              anchor="bottom"
              onPress={() => onProviderPress?.(marker.id)}
            >
              <View
                style={[
                  styles.providerMarker,
                  {
                    backgroundColor: selected ? theme.colors.secondary : color,
                    borderColor: theme.colors.surface,
                    transform: [{ scale: selected ? 1.16 : 1 }],
                  },
                ]}
              >
                <Icon name="wrench" size={13} color={theme.colors.onBrand} />
              </View>
            </ViewAnnotation>
          );
        })}

        {validCoordinate(selectedCoordinate) ? (
          <ViewAnnotation
            id="athoo-selected-location"
            title="Selected service location"
            lngLat={[selectedCoordinate.longitude, selectedCoordinate.latitude]}
            anchor="bottom"
            draggable={editable}
            onDragEnd={handleDragEnd}
          >
            <View style={[styles.selectedMarker, { backgroundColor: theme.colors.danger, borderColor: theme.colors.surface }]}>
              <Icon name="map-pin" size={18} color={theme.colors.onBrand} />
            </View>
          </ViewAnnotation>
        ) : null}
      </Map>

      <View style={styles.controls}>
        {validCoordinate(userCoordinate) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recenter map on current location"
            onPress={() => moveCameraTo(userCoordinate)}
            style={[styles.controlButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <Icon name="navigation" size={18} color={theme.colors.primary} />
          </Pressable>
        ) : null}

        {safeRoute.length >= 2 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fit the route on screen"
            onPress={() => {
              const bounds = boundsFor(safeRoute);
              if (bounds) {
                cameraRef.current?.fitBounds(bounds, {
                  padding: { top: 96, right: 48, bottom: 190, left: 48 },
                  duration: 550,
                  easing: "ease",
                });
              }
            }}
            style={[styles.controlButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <Icon name="maximize" size={18} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {editable ? (
        <View pointerEvents="none" style={[styles.editHint, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.editHintText, { color: theme.colors.textSecondary }]}>
            Tap the map or drag the red pin to set the exact service location
          </Text>
        </View>
      ) : null}

      <View pointerEvents="none" style={[styles.attribution, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.attributionText, { color: theme.colors.textMuted }]}>{attribution}</Text>
      </View>
      </View>
    </NativeMapErrorBoundary>
  );
}

function createStyles(theme: AthooTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 320,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceAlt,
    },
    map: {
      flex: 1,
    },
    controls: {
      position: "absolute",
      right: 14,
      top: 82,
      gap: 10,
    },
    controlButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.text,
      shadowOpacity: 0.16,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
    selectedMarker: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 3,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.text,
      shadowOpacity: 0.24,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 3 },
      elevation: 7,
    },
    providerMarker: {
      width: 31,
      height: 31,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.text,
      shadowOpacity: 0.2,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    userPulse: {
      width: 25,
      height: 25,
      borderRadius: 13,
      borderWidth: 3,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.infoSoft,
    },
    userDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    editHint: {
      position: "absolute",
      left: 16,
      right: 76,
      bottom: 18,
      borderRadius: 12,
      paddingHorizontal: 11,
      paddingVertical: 8,
      shadowColor: theme.colors.text,
      shadowOpacity: 0.12,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    editHintText: {
      fontSize: 11,
      fontWeight: "700",
    },
    attribution: {
      position: "absolute",
      right: 8,
      bottom: 4,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      opacity: 0.86,
    },
    attributionText: {
      fontSize: 8,
      fontWeight: "600",
    },
    nativeNotice: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      shadowColor: theme.colors.text,
      shadowOpacity: 0.12,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    nativeNoticeText: {
      textAlign: "center",
      fontSize: 11,
      fontWeight: "700",
    },
  });
}