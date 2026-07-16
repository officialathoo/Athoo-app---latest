import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api, realtime } from "@/services/api";
import { brandConfig } from "@/config/brand";
import { runtimeConfig } from "@/config/runtime";

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
}

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
};

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
      if (res?.settings) {
        setSettings({ ...FALLBACK_SETTINGS, ...res.settings });
      }
    } catch {
      // Non-fatal — use fallback
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
