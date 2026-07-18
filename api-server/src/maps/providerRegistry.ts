import type { MapOperationProvider } from "./types.ts";
import { customProvider } from "./providers/custom.ts";
import { mapboxProvider } from "./providers/mapbox.ts";
import { nominatimProvider } from "./providers/nominatim.ts";
import { osrmProvider } from "./providers/osrm.ts";
import { photonProvider } from "./providers/photon.ts";
import { tomtomProvider } from "./providers/tomtom.ts";

const providers = new Map<string, MapOperationProvider>([
  [photonProvider.id, photonProvider],
  [nominatimProvider.id, nominatimProvider],
  [mapboxProvider.id, mapboxProvider],
  [tomtomProvider.id, tomtomProvider],
  [osrmProvider.id, osrmProvider],
  ["custom", customProvider],
]);

export function getMapOperationProvider(id: string): MapOperationProvider | null {
  const normalized = String(id || "").trim().toLowerCase();
  if (!normalized || normalized === "disabled") return null;
  return providers.get(normalized) || null;
}

export function supportsMapOperation(id: string, operation: "search" | "reverse" | "directions"): boolean {
  const provider = getMapOperationProvider(id);
  return Boolean(provider?.[operation]);
}

export function registeredMapProviders(): string[] {
  return [...providers.keys()];
}
