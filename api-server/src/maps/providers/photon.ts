import type { GeoResult, MapOperationProvider, SearchRequest } from "../types.ts";
import { baseUrl, fetchWithTimeout, precisionFromText, validCoordinate } from "../utils.ts";

interface PhotonFeature {
  type: "Feature";
  properties: {
    name?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    countrycode?: string;
  };
  geometry: { type: "Point"; coordinates: [number, number] };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

const TYPE_RANK: Record<string, number> = {
  house: 1,
  other: 2,
  street: 3,
  locality: 4,
  district: 5,
  city: 6,
  county: 7,
  state: 8,
  country: 9,
};

function buildLabel(properties: PhotonFeature["properties"]): string {
  const parts: string[] = [];
  if (properties.housenumber && properties.street) parts.push(`${properties.housenumber} ${properties.street}`);
  else if (properties.housenumber && properties.name && properties.name !== properties.street) parts.push(`${properties.housenumber} ${properties.name}`);
  else if (properties.street && properties.type === "house") parts.push(properties.street);
  else if (properties.name && !["city", "state", "country"].includes(properties.type || "")) {
    if (!properties.city || properties.name.toLowerCase() !== properties.city.toLowerCase()) parts.push(properties.name);
  }
  if (properties.district && properties.district !== properties.city) parts.push(properties.district);
  if (properties.city) parts.push(properties.city);
  return [...new Set(parts.filter(Boolean))].join(", ");
}

function toResult(feature: PhotonFeature): GeoResult | null {
  const [lng, lat] = feature.geometry?.coordinates || [];
  if (!validCoordinate(Number(lat), Number(lng))) return null;
  const properties = feature.properties || {};
  const label = buildLabel(properties);
  if (label.length < 3) return null;
  const primary = properties.housenumber && properties.street
    ? `${properties.housenumber} ${properties.street}`
    : properties.name || properties.street || properties.district || properties.city || label.split(",")[0] || label;
  const secondary = [properties.district, properties.city, properties.state, properties.postcode]
    .filter((value, index, values): value is string => Boolean(value) && value !== primary && values.indexOf(value) === index)
    .join(", ");
  const identity = `${properties.osm_key || "place"}:${properties.osm_value || properties.type || "unknown"}:${Number(lat).toFixed(6)}:${Number(lng).toFixed(6)}`;
  return {
    placeId: `photon:${identity}`,
    label,
    primary,
    secondary,
    lat: Number(lat),
    lng: Number(lng),
    city: properties.city,
    province: properties.state,
    postcode: properties.postcode,
    precision: precisionFromText(properties.type),
    source: "photon",
  };
}

async function search(request: SearchRequest): Promise<GeoResult[]> {
  const url = new URL(`${baseUrl("PHOTON_BASE_URL", "https://photon.komoot.io")}/api`);
  url.searchParams.set("q", request.query);
  url.searchParams.set("countrycodes", String(process.env.MAP_COUNTRY_CODE || "pk").toLowerCase());
  url.searchParams.set("limit", String(Math.min(12, Math.max(1, request.limit))));
  url.searchParams.set("lang", String(process.env.MAP_LANGUAGE || "en"));
  if (request.bias && validCoordinate(request.bias.lat, request.bias.lng)) {
    url.searchParams.set("lat", String(request.bias.lat));
    url.searchParams.set("lon", String(request.bias.lng));
  }
  const response = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": "AthooApp/1.0", Accept: "application/json" },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as PhotonResponse;
  return Array.isArray(data.features)
    ? data.features.map(toResult).filter((result): result is GeoResult => Boolean(result))
    : [];
}

async function reverse({ lat, lng }: { lat: number; lng: number }): Promise<string | null> {
  const url = new URL(`${baseUrl("PHOTON_BASE_URL", "https://photon.komoot.io")}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", String(process.env.MAP_LANGUAGE || "en"));
  const response = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": "AthooApp/1.0", Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as PhotonResponse;
  if (!Array.isArray(data.features) || data.features.length === 0) return null;
  const sorted = [...data.features].sort(
    (a, b) => (TYPE_RANK[a.properties.type || ""] ?? 10) - (TYPE_RANK[b.properties.type || ""] ?? 10),
  );
  for (const feature of sorted) {
    if (["county", "state", "country"].includes(feature.properties.type || "")) continue;
    const label = buildLabel(feature.properties);
    if (label.length > 4 && label.includes(",")) return label;
  }
  const label = buildLabel(sorted[0].properties);
  return label.length > 2 ? label : null;
}

export const photonProvider: MapOperationProvider = { id: "photon", search, reverse };
