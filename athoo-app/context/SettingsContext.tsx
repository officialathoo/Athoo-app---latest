import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api, realtime } from "@/services/api";
import { brandConfig } from "@/config/brand";
import { runtimeConfig } from "@/config/runtime";

export interface PublicMapSettings {
  configured: boolean;
  productionSafe: boolean;
  provider: string;
  tileProvider: string;
  tileSize: 256 | 512;
  attribution: string;
  tileUrl: string;
}

export interface PublicSettings {
  platformName: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultVisitCharge: number;
  defaultHourlyRate: number;
  defaultCommissionLimit: number;
  defaultServiceRadiusKm: number;
  broadcastTTLMinutes: number;
  maxNegotiationRounds: number;
  premiumProfileBadgeEnabled: boolean;
  customerCancellationFee: number;
  providerCancellationPenalty: number;
  premiumCommissionDiscountPercent: number;
  commissionRate: number;
  map: PublicMapSettings;
}

const fallbackTileUrl = runtimeConfig.maps.tileUrl || "";
const fallbackTileConfigured = ["{z}", "{x}", "{y}"].every((token) => fallbackTileUrl.includes(token));

const FALLBACK_SETTINGS: PublicSettings = {
  platformName: brandConfig.displayName,
  supportPhone: runtimeConfig.support.phoneDisplay || "",
  supportEmail: runtimeConfig.support.email || "",
  maintenanceMode: false,
  defaultVisitCharge: 200,
  defaultHourlyRate: 500,
  defaultCommissionLimit: 5000,
  defaultServiceRadiusKm: 25,
  broadcastTTLMinutes: 30,
  maxNegotiationRounds: 3,
  premiumProfileBadgeEnabled: true,
  customerCancellationFee: 0,
  providerCancellationPenalty: 0,
  premiumCommissionDiscountPercent: 0,
  commissionRate: 10,
  map: {
    configured: fallbackTileConfigured,
    productionSafe: fallbackTileConfigured,
    provider: "deployment configuration",
    tileProvider: "environment",
    tileSize: runtimeConfig.maps.tileSize,
    attribution: runtimeConfig.maps.attribution,
    tileUrl: fallbackTileUrl,
  },
};


function resolveTileUrl(value: unknown): string {
  const candidate = String(value || "").trim();
  if (!candidate) return FALLBACK_SETTINGS.map.tileUrl;
  if (/^https:\/\//i.test(candidate)) return candidate;
  if (candidate.startsWith("/") && api.baseUrl) return `${api.baseUrl}${candidate}`;
  return FALLBACK_SETTINGS.map.tileUrl;
}

function normalizedSettings(value: unknown): PublicSettings {
  const incoming = value && typeof value === "object" ? value as Partial<PublicSettings> : {};
  const incomingMap = incoming.map && typeof incoming.map === "object"
    ? incoming.map as Partial<PublicMapSettings>
    : {};
  const tileSize: 256 | 512 = incomingMap.tileSize === 512 ? 512 : incomingMap.tileSize === 256
    ? 256
    : FALLBACK_SETTINGS.map.tileSize;

  return {
    ...FALLBACK_SETTINGS,
    ...incoming,
    map: {
      ...FALLBACK_SETTINGS.map,
      ...incomingMap,
      configured: typeof incomingMap.configured === "boolean"
        ? incomingMap.configured
        : FALLBACK_SETTINGS.map.configured,
      productionSafe: typeof incomingMap.productionSafe === "boolean"
        ? incomingMap.productionSafe
        : FALLBACK_SETTINGS.map.productionSafe,
      tileSize,
      attribution: String(incomingMap.attribution || FALLBACK_SETTINGS.map.attribution).trim(),
      tileUrl: resolveTileUrl(incomingMap.tileUrl),
    },
  };
}

interface SettingsContextValue {
  settings: PublicSettings;
  loading: boolean;
  refresh: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: FALLBACK_SETTINGS,
  loading: false,
  refresh: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await api.getPublicSettings();
      if (res?.settings) setSettings(normalizedSettings(res.settings));
    } catch {
      // Non-fatal: keep the last known safe settings or deployment fallback.
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const off = realtime.on((msg) => {
      const resource = (msg.payload as any)?.resource;
      if (msg.type === "admin:event" && (resource === "settings" || resource === "marketing")) load();
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => { off(); sub.remove(); };
  }, [load]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
