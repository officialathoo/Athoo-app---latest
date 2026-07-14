import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { api, realtime } from "@/services/api";
import { SERVICE_CATEGORIES } from "@/data/services";

export interface AppCategory {
  id: string;
  slug: string;
  name: string;
  nameUrdu: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  descriptionUrdu: string;
  visitCharge?: number;
  commissionPct?: number;
  minHourlyRate?: number;
  maxHourlyRate?: number;
  averageHourlyRate?: number;
  ratePerHour?: number;
  isActive?: boolean;
  sortOrder?: number;
  searchKeywords?: string[];
  isFeatured?: boolean;
}

const ICON_COLOR_FALLBACK: Record<string, { icon: string; color: string; bgColor: string; nameUrdu: string; descriptionUrdu: string }> = {};
SERVICE_CATEGORIES.forEach((s) => {
  ICON_COLOR_FALLBACK[s.id] = {
    icon: s.icon,
    color: s.color,
    bgColor: s.bgColor,
    nameUrdu: s.nameUrdu,
    descriptionUrdu: s.descriptionUrdu,
  };
});

// Derive a very light background tint from a hex color for categories without bgColor in DB.
function deriveBgColor(hex: string): string {
  try {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const mix = (ch: number) => Math.round(ch + (255 - ch) * 0.88);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  } catch {
    return "#F9FAFB";
  }
}

function mapApiCategory(raw: any): AppCategory {
  const slug = raw.slug || raw.id || "";
  const fallback = ICON_COLOR_FALLBACK[slug] || { icon: "tool", color: "#6B7280", bgColor: "#F9FAFB", nameUrdu: "", descriptionUrdu: "" };
  const color = raw.color || fallback.color;
  return {
    id: raw.id,
    slug,
    name: raw.name || slug,
    nameUrdu: raw.nameUrdu || raw.name_urdu || raw.nameUr || fallback.nameUrdu || raw.name,
    icon: raw.icon || fallback.icon,
    color,
    bgColor: raw.bgColor || raw.bg_color || fallback.bgColor || deriveBgColor(color),
    description: raw.description || "",
    descriptionUrdu: raw.descriptionUrdu || raw.description_urdu || fallback.descriptionUrdu || raw.description || "",
    visitCharge: raw.visitCharge ?? raw.visit_charge ?? 0,
    commissionPct: raw.commissionPct ?? raw.commission_pct ?? 10,
    minHourlyRate: raw.minHourlyRate ?? raw.min_hourly_rate ?? raw.minimumHourlyRate ?? raw.minimum_hourly_rate ?? 0,
    maxHourlyRate: raw.maxHourlyRate ?? raw.max_hourly_rate ?? raw.maximumHourlyRate ?? raw.maximum_hourly_rate ?? 0,
    averageHourlyRate: raw.averageHourlyRate ?? raw.average_hourly_rate ?? raw.avgHourlyRate ?? raw.avg_hourly_rate ?? raw.ratePerHour ?? raw.rate_per_hour ?? 0,
    ratePerHour: raw.ratePerHour ?? raw.rate_per_hour ?? 0,
    isActive: raw.isActive ?? raw.is_active ?? true,
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
    searchKeywords: String(raw.searchKeywords ?? raw.search_keywords ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    isFeatured: raw.isFeatured ?? raw.is_featured ?? false,
  };
}

interface CategoriesContextType {
  categories: AppCategory[];
  isLoading: boolean;
  reload: () => void;
  getCategoryBySlug: (slug: string) => AppCategory | undefined;
}

const CATEGORIES_CACHE_KEY = "athoo.admin.categories.cache.v1";

const CategoriesContext = createContext<CategoriesContextType>({
  categories: [],
  isLoading: false,
  reload: () => {},
  getCategoryBySlug: () => undefined,
});

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);
    try {
      const res = await api.getCategories();
      const next = Array.isArray(res.categories) ? res.categories.map(mapApiCategory) : [];
      setCategories(next);
      await AsyncStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(next));
    } catch {
      // Keep the most recent admin-managed data when the device is offline.
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CATEGORIES_CACHE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCategories(parsed);
      })
      .catch(() => {})
      .finally(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  // Keep customer/provider apps linked with admin panel changes.
  // When admin creates/activates/deactivates a category, backend emits admin:event.
  // Also reload when app returns to foreground so changes made while offline/sleeping appear automatically.
  useEffect(() => {
    const off = realtime.on((msg) => {
      const resource = (msg.payload as any)?.resource;
      if (msg.type === "admin:event" && resource === "categories") {
        load();
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    const interval = setInterval(load, 300000);
    return () => {
      off();
      sub.remove();
      clearInterval(interval);
    };
  }, [load]);

  const getCategoryBySlug = useCallback(
    (slug: string) => {
      if (!slug) return undefined;
      const lower = slug.toLowerCase().trim();
      return categories.find(
        (c) =>
          c.slug === slug ||
          c.id === slug ||
          c.slug === lower ||
          // match name string (e.g. "Electrician") — older providers stored display names
          c.name.toLowerCase() === lower ||
          // normalise underscores ↔ hyphens (e.g. "ac_repair" matches "ac-repair")
          c.slug.replace(/-/g, "_") === lower.replace(/-/g, "_")
      );
    },
    [categories]
  );

  return (
    <CategoriesContext.Provider value={{ categories, isLoading, reload: load, getCategoryBySlug }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
