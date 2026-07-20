import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Polyline as SvgPolyline } from "react-native-svg";
import { useTheme } from "@/context/ThemeContext";
import { useSettings } from "@/context/SettingsContext";
import type { AthooTheme } from "@/design/theme";

const MAX_LATITUDE = 85.05112878;
const DEFAULT_CENTER = { latitude: 30.3753, longitude: 69.3451 };

function tileUrl(template: string, zoom: number, x: number, y: number, refreshKey: number): string {
  const base = template
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  if (refreshKey <= 0) return base;
  return `${base}${base.includes("?") ? "&" : "?"}athoo_retry=${refreshKey}`;
}

type Coordinate = { latitude: number; longitude: number };

export type OpenMapMarker = Coordinate & {
  id?: string;
  kind?: "selected" | "provider" | "customer" | "job";
  label?: string;
};

type Props = {
  latitude?: number;
  longitude?: number;
  height?: number;
  zoom?: number;
  markers?: OpenMapMarker[];
  polyline?: Coordinate[];
  interactive?: boolean;
  onCoordinateChange?: (latitude: number, longitude: number) => void;
};

type Size = { width: number; height: number };
type WorldPoint = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isCoordinate<T extends Coordinate>(value: T | undefined | null): value is T {
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

function worldSize(zoom: number, tileSize: 256 | 512): number {
  return tileSize * 2 ** zoom;
}

function project(coordinate: Coordinate, zoom: number, tileSize: 256 | 512): WorldPoint {
  const size = worldSize(zoom, tileSize);
  const latitude = clamp(coordinate.latitude, -MAX_LATITUDE, MAX_LATITUDE);
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((coordinate.longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

function unproject(point: WorldPoint, zoom: number, tileSize: 256 | 512): Coordinate {
  const size = worldSize(zoom, tileSize);
  const longitude = (point.x / size) * 360 - 180;
  const y = 0.5 - point.y / size;
  const latitude = 90 - (360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI;
  return {
    latitude: clamp(latitude, -90, 90),
    longitude: clamp(longitude, -180, 180),
  };
}

function chooseZoom(points: Coordinate[], size: Size, tileSize: 256 | 512, requested?: number): number {
  if (Number.isFinite(requested)) return clamp(Math.round(requested as number), 3, 18);
  if (points.length <= 1) return 15;

  const safeWidth = Math.max(120, size.width - 72);
  const safeHeight = Math.max(120, size.height - 72);
  for (let zoom = 18; zoom >= 3; zoom -= 1) {
    const projected = points.map((point) => project(point, zoom, tileSize));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    if (Math.max(...xs) - Math.min(...xs) <= safeWidth && Math.max(...ys) - Math.min(...ys) <= safeHeight) {
      return zoom;
    }
  }
  return 3;
}

function normalizeTileX(x: number, zoom: number): number {
  const count = 2 ** zoom;
  return ((x % count) + count) % count;
}

function markerColor(kind: OpenMapMarker["kind"], theme: AthooTheme): string {
  if (kind === "provider") return theme.colors.primary;
  if (kind === "customer" || kind === "job") return theme.colors.secondary;
  return theme.colors.danger;
}

export function OpenStreetMapPreview({
  latitude,
  longitude,
  height = 220,
  zoom,
  markers = [],
  polyline = [],
  interactive = false,
  onCoordinateChange,
}: Props) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const mapSettings = settings.map;
  const tileSize = mapSettings.tileSize === 512 ? 512 : 256;
  const tileTemplate = String(mapSettings.tileUrl || "").trim();
  // A tokenized Athoo proxy URL is safe to attempt even when a stale settings
  // payload has not yet refreshed its configured/productionSafe flags. The API
  // still enforces production provider policy server-side.
  const tileTemplateConfigured = ["{z}", "{x}", "{y}"].every((token) => tileTemplate.includes(token));
  const attribution = String(mapSettings.attribution || "© OpenStreetMap contributors").trim();
  const styles = useMemo(() => createStyles(theme, tileSize), [theme, tileSize]);
  const [size, setSize] = useState<Size>({ width: 360, height });
  const [failedTiles, setFailedTiles] = useState(0);
  const [loadedTiles, setLoadedTiles] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setFailedTiles(0);
    setLoadedTiles(0);
    setRefreshKey(0);
  }, [tileTemplate, tileSize, mapSettings.provider, mapSettings.configured, mapSettings.productionSafe]);

  const explicitCenter = isCoordinate({ latitude: latitude as number, longitude: longitude as number })
    ? { latitude: latitude as number, longitude: longitude as number }
    : null;

  const validMarkers = useMemo(() => markers.filter(isCoordinate), [markers]);
  const validPolyline = useMemo(() => polyline.filter(isCoordinate), [polyline]);
  const allPoints = useMemo(() => {
    const points: Coordinate[] = [...validMarkers, ...validPolyline];
    if (explicitCenter) points.push(explicitCenter);
    return points.length ? points : [DEFAULT_CENTER];
  }, [explicitCenter, validMarkers, validPolyline]);

  const resolvedZoom = useMemo(
    () => chooseZoom(allPoints, size, tileSize, zoom),
    [allPoints, size, tileSize, zoom],
  );
  const center = useMemo<Coordinate>(() => {
    if (explicitCenter) return explicitCenter;
    const latitudes = allPoints.map((point) => point.latitude);
    const longitudes = allPoints.map((point) => point.longitude);
    return {
      latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    };
  }, [allPoints, explicitCenter]);

  const centerWorld = useMemo(() => project(center, resolvedZoom, tileSize), [center, resolvedZoom, tileSize]);

  const tiles = useMemo(() => {
    if (!tileTemplateConfigured || !size.width || !size.height) return [];
    const startX = Math.floor((centerWorld.x - size.width / 2) / tileSize);
    const endX = Math.floor((centerWorld.x + size.width / 2) / tileSize);
    const startY = Math.floor((centerWorld.y - size.height / 2) / tileSize);
    const endY = Math.floor((centerWorld.y + size.height / 2) / tileSize);
    const maxTile = 2 ** resolvedZoom;
    const next: Array<{ key: string; left: number; top: number; url: string }> = [];

    for (let tileY = startY; tileY <= endY; tileY += 1) {
      if (tileY < 0 || tileY >= maxTile) continue;
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        const normalizedX = normalizeTileX(tileX, resolvedZoom);
        next.push({
          key: `${resolvedZoom}-${tileX}-${tileY}`,
          left: tileX * tileSize - centerWorld.x + size.width / 2,
          top: tileY * tileSize - centerWorld.y + size.height / 2,
          url: tileUrl(tileTemplate, resolvedZoom, normalizedX, tileY, refreshKey),
        });
      }
    }
    return next;
  }, [centerWorld, refreshKey, resolvedZoom, size, tileSize, tileTemplate, tileTemplateConfigured]);

  function pointOnScreen(coordinate: Coordinate): WorldPoint {
    const point = project(coordinate, resolvedZoom, tileSize);
    return {
      x: point.x - centerWorld.x + size.width / 2,
      y: point.y - centerWorld.y + size.height / 2,
    };
  }

  const routePoints = validPolyline.map(pointOnScreen).map((point) => `${point.x},${point.y}`).join(" ");

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout;
    if (next.width > 0 && next.height > 0) setSize({ width: next.width, height: next.height });
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!interactive || !onCoordinateChange) return;
    const { locationX, locationY } = event.nativeEvent;
    const next = unproject({
      x: centerWorld.x + locationX - size.width / 2,
      y: centerWorld.y + locationY - size.height / 2,
    }, resolvedZoom, tileSize);
    onCoordinateChange(next.latitude, next.longitude);
  };

  const content = (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        { height, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
      ]}
    >
      {tiles.map((tile) => (
        <Image
          key={`${tile.key}-${refreshKey}`}
          source={{ uri: tile.url }}
          resizeMode="cover"
          onLoad={() => setLoadedTiles((count) => count + 1)}
          onError={() => setFailedTiles((count) => count + 1)}
          style={[styles.tile, { left: tile.left, top: tile.top }]}
        />
      ))}

      {routePoints ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <SvgPolyline
            points={routePoints}
            fill="none"
            stroke={theme.colors.primary}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}

      {validMarkers.map((marker, index) => {
        const screen = pointOnScreen(marker);
        const color = markerColor(marker.kind, theme);
        return (
          <View
            key={marker.id || `${marker.latitude}-${marker.longitude}-${index}`}
            pointerEvents="none"
            style={[styles.markerWrap, { left: screen.x - 14, top: screen.y - 30 }]}
          >
            <View style={[styles.markerDot, { backgroundColor: color }]} />
            <View style={[styles.markerTip, { borderTopColor: color }]} />
          </View>
        );
      })}

      {!tileTemplateConfigured || (
        tiles.length > 0 &&
        failedTiles >= Math.max(3, Math.ceil(tiles.length / 2)) &&
        failedTiles + loadedTiles >= tiles.length
      ) ? (
        <View style={styles.failureOverlay}>
          <Text style={styles.failureTitle}>Map preview unavailable</Text>
          <Text style={styles.failureText}>
            {tileTemplateConfigured
              ? "Your selected address is still saved. Check your connection and retry the map."
              : "Map tiles are not currently available. Your selected address is still saved."}
          </Text>
          {tileTemplateConfigured ? (
            <Pressable
              onPress={() => {
                setFailedTiles(0);
                setLoadedTiles(0);
                setRefreshKey((value) => value + 1);
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry Map</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {interactive ? (
        <View pointerEvents="none" style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap map to move pin</Text>
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.attribution}>
        <Text style={styles.attributionText}>{attribution}</Text>
      </View>
    </View>
  );

  return interactive ? <Pressable onPress={handlePress}>{content}</Pressable> : content;
}

function createStyles(theme: AthooTheme, tileSize: 256 | 512) {
  return StyleSheet.create({
    container: {
      width: "100%",
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
      position: "relative",
    },
    tile: { position: "absolute", width: tileSize, height: tileSize },
    markerWrap: { position: "absolute", width: 28, height: 34, alignItems: "center" },
    markerDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 3,
      borderColor: theme.colors.white,
      shadowColor: theme.colors.overlay,
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    markerTip: {
      width: 0,
      height: 0,
      marginTop: -2,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderTopWidth: 10,
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
    },
    attribution: {
      position: "absolute",
      right: 5,
      bottom: 4,
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
    },
    attributionText: { fontSize: 8, color: theme.colors.textSecondary },
    tapHint: {
      position: "absolute",
      left: 8,
      top: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: theme.colors.elevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    tapHintText: { fontSize: 11, fontWeight: "600", color: theme.colors.textSecondary },
    failureOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      backgroundColor: theme.colors.elevated,
    },
    failureTitle: { fontSize: 15, fontWeight: "700", textAlign: "center", color: theme.colors.text },
    failureText: { marginTop: 5, fontSize: 12, lineHeight: 18, textAlign: "center", color: theme.colors.textSecondary },
    retryButton: { marginTop: 12, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: theme.colors.primary },
    retryText: { color: theme.colors.white, fontSize: 13, fontWeight: "700" },
  });
}
