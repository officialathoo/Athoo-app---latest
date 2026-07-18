export type GeoPrecision = "building" | "street" | "area" | "city" | "region";

export interface GeoResult {
  placeId: string;
  label: string;
  primary: string;
  secondary: string;
  lat: number;
  lng: number;
  city?: string;
  province?: string;
  postcode?: string;
  precision: GeoPrecision;
  source: string;
  distanceKm?: number;
}

export interface SearchRequest {
  query: string;
  limit: number;
  bias?: { lat: number; lng: number };
}

export interface ReverseRequest {
  lat: number;
  lng: number;
}

export interface DirectionsRequest {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

export interface DirectionsResult {
  polyline: { latitude: number; longitude: number }[];
  distanceKm: number | null;
  durationMin: number | null;
  source: string;
}

export interface MapOperationProvider {
  readonly id: string;
  search?(request: SearchRequest): Promise<GeoResult[]>;
  reverse?(request: ReverseRequest): Promise<string | null>;
  directions?(request: DirectionsRequest): Promise<DirectionsResult | null>;
}
