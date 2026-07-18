import type { GeoResult, MapOperationProvider, SearchRequest } from "../types.ts";
import { baseUrl, fetchWithTimeout, precisionFromText, validCoordinate } from "../utils.ts";

interface NominatimItem {
  place_id?: number | string;
  name?: string;
  display_name: string;
  type?: string;
  category?: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

function headers(): Record<string, string> {
  const contactEmail = String(process.env.MAP_CONTACT_EMAIL || "support@athoo.pk").trim();
  return {
    "User-Agent": String(process.env.MAP_USER_AGENT || `AthooApp/1.0 (+https://athoo.pk; contact: ${contactEmail})`).trim(),
    "Accept-Language": String(process.env.MAP_LANGUAGE || "en"),
    Accept: "application/json",
  };
}

function cleanLabel(item: NominatimItem): string {
  const address = item.address || {};
  const parts: string[] = [];
  if (item.name && !/^\d/.test(item.name)) parts.push(item.name);
  if (address.house_number && address.road) parts.push(`${address.house_number} ${address.road}`);
  else if (address.road) parts.push(address.road);
  const area = address.neighbourhood || address.suburb || address.quarter || address.city_district;
  if (area && area !== item.name) parts.push(area);
  const city = address.city || address.town || address.village || address.county;
  if (city) parts.push(city);
  const unique = parts.filter((part, index) => part && part !== parts[index - 1]);
  return unique.length ? unique.join(", ") : item.display_name.split(",").slice(0, 4).join(",").trim();
}

function toResult(item: NominatimItem): GeoResult | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!validCoordinate(lat, lng)) return null;
  const address = item.address || {};
  const label = cleanLabel(item);
  if (label.length < 3) return null;
  const primary = item.name || (address.house_number && address.road ? `${address.house_number} ${address.road}` : address.road) || label.split(",")[0] || label;
  const city = address.city || address.town || address.village || address.county;
  const secondary = [address.neighbourhood, address.suburb, address.quarter, address.city_district, city, address.state, address.postcode]
    .filter((value, index, values): value is string => Boolean(value) && value !== primary && values.indexOf(value) === index)
    .join(", ");
  return {
    placeId: `nominatim:${item.place_id || `${lat.toFixed(6)}:${lng.toFixed(6)}`}`,
    label,
    primary,
    secondary,
    lat,
    lng,
    city,
    province: address.state,
    postcode: address.postcode,
    precision: precisionFromText(item.type),
    source: "nominatim",
  };
}

async function search(request: SearchRequest): Promise<GeoResult[]> {
  const url = new URL(`${baseUrl("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org")}/search`);
  url.searchParams.set("q", request.query);
  url.searchParams.set("countrycodes", String(process.env.MAP_COUNTRY_CODE || "pk").toLowerCase());
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(Math.min(10, Math.max(1, request.limit))));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("accept-language", String(process.env.MAP_LANGUAGE || "en"));
  if (request.bias && validCoordinate(request.bias.lat, request.bias.lng)) {
    const delta = 1.25;
    url.searchParams.set("viewbox", `${request.bias.lng - delta},${request.bias.lat + delta},${request.bias.lng + delta},${request.bias.lat - delta}`);
  }
  const response = await fetchWithTimeout(url.toString(), { headers: headers() });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data)
    ? (data as NominatimItem[]).map(toResult).filter((result): result is GeoResult => Boolean(result))
    : [];
}

async function reverse({ lat, lng }: { lat: number; lng: number }): Promise<string | null> {
  const url = new URL(`${baseUrl("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org")}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", String(process.env.MAP_LANGUAGE || "en"));
  const response = await fetchWithTimeout(url.toString(), { headers: headers() });
  if (!response.ok) return null;
  const item = (await response.json()) as NominatimItem;
  const address = item.address || {};
  if (address.road || address.neighbourhood || address.suburb || item.name) return cleanLabel(item);
  return item.display_name ? item.display_name.split(",").slice(0, 4).join(",").trim() : null;
}

export const nominatimProvider: MapOperationProvider = { id: "nominatim", search, reverse };
