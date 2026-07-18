import type { DirectionsResult, MapOperationProvider } from "../types.ts";
import { baseUrl, fetchWithTimeout, validCoordinate } from "../utils.ts";

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
}

async function directions(request: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}): Promise<DirectionsResult | null> {
  const profile = String(process.env.OSRM_PROFILE || "driving").replace(/^\/+|\/+$/g, "");
  const url =
    `${baseUrl("OSRM_BASE_URL", "https://router.project-osrm.org")}/route/v1/${profile}` +
    `/${request.originLng},${request.originLat};${request.destLng},${request.destLat}` +
    `?overview=full&geometries=geojson&steps=false`;
  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": String(process.env.MAP_USER_AGENT || "AthooApp/1.0 (+https://athoo.pk)") },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as OsrmResponse;
  const route = data.code === "Ok" ? data.routes?.[0] : undefined;
  const coordinates = route?.geometry?.coordinates || [];
  if (!route || coordinates.length < 2) return null;
  const polyline = coordinates
    .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
    .filter((coordinate) => validCoordinate(coordinate.latitude, coordinate.longitude));
  if (polyline.length < 2) return null;
  return {
    polyline,
    distanceKm: Number.isFinite(route.distance) ? Number(route.distance) / 1000 : null,
    durationMin: Number.isFinite(route.duration) ? Math.ceil(Number(route.duration) / 60) : null,
    source: "osrm",
  };
}

export const osrmProvider: MapOperationProvider = { id: "osrm", directions };
