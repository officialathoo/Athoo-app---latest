import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import type { PlatformSettings } from "@/lib/types";
import {
  Save, Loader2, CheckCircle, AlertCircle, Globe,
  Phone, DollarSign, Users, Clock, Shield, AlertTriangle,
  Megaphone, MessageSquare, Crown, Slash, Mail, MapPinned, Route,
  RadioTower, HardDrive, BellRing, RefreshCw,
} from "lucide-react";

function TestEmailButton() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function handleTest() {
    setState("loading"); setMsg("");
    try {
      const r = await api<{ ok: boolean; channel: string; to: string }>("/api/admin/settings/test-email", { method: "POST" });
      if (r.ok) { setState("ok"); setMsg(`Test email sent to ${r.to} via ${r.channel}`); }
      else { setState("error"); setMsg("SMTP configured but send failed. Check server logs."); }
    } catch (e: any) {
      setState("error"); setMsg(e?.message || "Failed to send test email");
    }
    setTimeout(() => setState("idle"), 5000);
  }
  return (
    <div className="flex items-center gap-3 mt-2">
      <button type="button" onClick={handleTest} disabled={state === "loading"}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
        {state === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        {state === "loading" ? "Sending…" : "Send Test Email"}
      </button>
      {state === "ok" && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={13} />{msg}</span>}
      {state === "error" && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={13} />{msg}</span>}
    </div>
  );
}

type Form = {
  commissionRate: string;
  defaultCommissionLimit: string;
  platformName: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultVisitCharge: string;
  maxBookingsPerDay: string;
  appVersion: string;
  minBookingNoticeHours: string;
  allowGuestBrowsing: boolean;
  providerAutoApprove: boolean;
  bookingCancellationWindowHours: string;
  broadcastTTLMinutes: string;
  broadcastInitialRadiusKm: string;
  broadcastExpansionRadiusKm: string;
  broadcastExpandAfterMinutes: string;
  maxNegotiationRounds: string;
  premiumCommissionDiscountPercent: string;
  premiumPriorityBoost: boolean;
  premiumProfileBadgeEnabled: boolean;
  defaultServiceRadiusKm: string;
  customerCancellationFee: string;
  providerCancellationPenalty: string;
  inactivityLifecycleEnabled: boolean;
  inactivityWarningDays: string;
  inactivityRestrictionDays: string;
  inactivityReviewDays: string;
  mapRuntimeConfigurationEnabled: boolean;
  mapPrimaryProvider: string;
  mapTileProvider: string;
  mapSearchProvider: string;
  mapReverseProvider: string;
  mapDirectionsProvider: string;
  mapProviderFallbackEnabled: boolean;
  mapSearchFallbackProvider: string;
  mapReverseFallbackProvider: string;
  mapDirectionsFallbackProvider: string;
  communicationRuntimeConfigurationEnabled: boolean;
  emailProvider: string;
  pushProvider: string;
};

type MapStatusResponse = {
  runtimeConfigurationEnabled: boolean;
  configuration: {
    primaryProvider: string;
    tileProvider: string;
    searchProvider: string;
    reverseProvider: string;
    directionsProvider: string;
    fallbackEnabled: boolean;
    searchFallbackProvider: string;
    reverseFallbackProvider: string;
    directionsFallbackProvider: string;
  };
  credentials: {
    tomtomConfigured: boolean;
    mapboxConfigured: boolean;
    customTileConfigured: boolean;
    customSearchConfigured: boolean;
    customReverseConfigured: boolean;
    customDirectionsConfigured: boolean;
  };
  status: { configured: boolean; productionSafe: boolean; provider: string; error?: string };
};

type IntegrationStatusItem = {
  provider: string;
  adapter?: string;
  configured: boolean;
  productionSafe?: boolean;
  runtimeSwitchable: boolean;
  restartRequired: boolean;
  migrationRequired?: boolean;
  adapterImplemented?: boolean;
  sharedAcrossInstances?: boolean;
  horizontalScaleSafe?: boolean;
  error?: string;
};

type IntegrationStatusResponse = {
  runtimeConfigurationEnabled: boolean;
  integrations: {
    maps: IntegrationStatusItem;
    email: IntegrationStatusItem;
    push: IntegrationStatusItem;
    otp: IntegrationStatusItem & { configuredChannels?: string[] };
    storage: IntegrationStatusItem;
    calls: IntegrationStatusItem;
    queue: IntegrationStatusItem;
    cache: IntegrationStatusItem;
  };
  notes: { runtimeSwitching: string; restartRequired: string; cacheScaling?: string };
};

const PRIMARY_MAP_PROVIDER_OPTIONS = [
  { value: "environment", label: "Use deployment environment" },
  { value: "tomtom", label: "TomTom" },
  { value: "mapbox", label: "Mapbox" },
  { value: "open", label: "Open stack (OSM + Photon + OSRM)" },
  { value: "custom", label: "Custom HTTP adapter" },
  { value: "disabled", label: "Disabled" },
];

const TILE_PROVIDER_OPTIONS = [
  { value: "environment", label: "Use deployment environment" },
  { value: "tomtom", label: "TomTom" },
  { value: "mapbox", label: "Mapbox" },
  { value: "custom", label: "Custom HTTP tiles" },
  { value: "openstreetmap", label: "OpenStreetMap (development only)" },
  { value: "disabled", label: "Disabled" },
];

const SEARCH_PROVIDER_OPTIONS = [
  { value: "environment", label: "Use deployment environment" },
  { value: "tomtom", label: "TomTom" },
  { value: "mapbox", label: "Mapbox" },
  { value: "photon", label: "Photon" },
  { value: "nominatim", label: "Nominatim" },
  { value: "custom", label: "Custom HTTP search" },
  { value: "disabled", label: "Disabled" },
];

const DIRECTIONS_PROVIDER_OPTIONS = [
  { value: "environment", label: "Use deployment environment" },
  { value: "tomtom", label: "TomTom" },
  { value: "mapbox", label: "Mapbox" },
  { value: "osrm", label: "OSRM" },
  { value: "custom", label: "Custom HTTP routing" },
  { value: "disabled", label: "Disabled" },
];


const EMAIL_PROVIDER_OPTIONS = [
  { value: "environment", label: "Use deployment environment" },
  { value: "smtp", label: "SMTP-compatible provider" },
  { value: "http_json", label: "Custom HTTP JSON adapter" },
  { value: "disabled", label: "Disabled" },
];

const PUSH_PROVIDER_OPTIONS = [
  { value: "environment", label: "Use deployment environment" },
  { value: "expo", label: "Expo Push Service" },
  { value: "http_json", label: "Custom HTTP JSON adapter" },
  { value: "disabled", label: "Disabled" },
];

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/70">
        <div className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
          <Icon size={15} className="text-slate-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}


function IntegrationCard({ label, item, icon: Icon }: { label: string; item?: IntegrationStatusItem; icon: any }) {
  if (!item) return null;
  const healthy = item.configured && item.productionSafe !== false;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-slate-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">{label}</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${healthy ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {healthy ? "Ready" : "Needs setup"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 break-all">{item.provider}{item.adapter && item.adapter !== item.provider ? ` · ${item.adapter}` : ""}</p>
          <p className="text-[11px] text-slate-400 mt-2">{item.runtimeSwitchable ? "Runtime switchable" : item.restartRequired ? `Deployment restart required${item.migrationRequired ? " · migration check required" : ""}` : "Configuration managed"}</p>
          {item.horizontalScaleSafe === false && item.provider === "memory" && (
            <p className="text-[11px] text-amber-700 mt-1">Single API instance only</p>
          )}
          {item.error && <p className="text-[11px] text-amber-700 mt-1">{item.error}</p>}
        </div>
      </div>
    </div>
  );
}

function TInput({ value, onChange, placeholder, prefix, suffix, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  prefix?: string; suffix?: string; type?: string;
}) {
  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-sm text-slate-400 pointer-events-none select-none">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${prefix ? "pl-10" : "pl-3"} ${suffix ? "pr-12" : "pr-3"}`}
      />
      {suffix && <span className="absolute right-3 text-sm text-slate-400 pointer-events-none select-none">{suffix}</span>}
    </div>
  );
}

function TSelect({ value, onChange, options, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      className="w-full py-2.5 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function Toggle({ value, onChange, onLabel = "On", offLabel = "Off" }: {
  value: boolean; onChange: (v: boolean) => void; onLabel?: string; offLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 mt-1">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={value ? onLabel : offLabel}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${value ? "bg-blue-600" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className={`text-sm font-medium ${value ? "text-blue-700" : "text-slate-500"}`}>{value ? onLabel : offLabel}</span>
    </div>
  );
}

export function SettingsPage() {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canWrite = hasPermission("settings.write");
  const canTestEmail = isSuperAdmin();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [mapStatus, setMapStatus] = useState<MapStatusResponse | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [mapTesting, setMapTesting] = useState(false);
  const [mapTestMessage, setMapTestMessage] = useState("");
  const [storageTesting, setStorageTesting] = useState(false);
  const [storageTestMessage, setStorageTestMessage] = useState("");

  const [form, setForm] = useState<Form>({
    commissionRate: "10",
    defaultCommissionLimit: "5000",
    platformName: "Athoo",
    supportPhone: "+92 339 0051068",
    supportEmail: "support@athoo.pk",
    maintenanceMode: false,
    defaultVisitCharge: "200",
    maxBookingsPerDay: "10",
    appVersion: "1.0.0",
    minBookingNoticeHours: "1",
    allowGuestBrowsing: true,
    providerAutoApprove: false,
    bookingCancellationWindowHours: "1",
    broadcastTTLMinutes: "30",
    broadcastInitialRadiusKm: "30",
    broadcastExpansionRadiusKm: "50",
    broadcastExpandAfterMinutes: "5",
    maxNegotiationRounds: "3",
    premiumCommissionDiscountPercent: "0",
    premiumPriorityBoost: true,
    premiumProfileBadgeEnabled: true,
    defaultServiceRadiusKm: "25",
    customerCancellationFee: "0",
    providerCancellationPenalty: "0",
    inactivityLifecycleEnabled: true,
    inactivityWarningDays: "60",
    inactivityRestrictionDays: "90",
    inactivityReviewDays: "180",
    mapRuntimeConfigurationEnabled: false,
    mapPrimaryProvider: "environment",
    mapTileProvider: "environment",
    mapSearchProvider: "environment",
    mapReverseProvider: "environment",
    mapDirectionsProvider: "environment",
    mapProviderFallbackEnabled: false,
    mapSearchFallbackProvider: "environment",
    mapReverseFallbackProvider: "environment",
    mapDirectionsFallbackProvider: "environment",
    communicationRuntimeConfigurationEnabled: false,
    emailProvider: "environment",
    pushProvider: "environment",
  });

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ settings: PlatformSettings }>("/api/admin/settings");
      const s = res.settings;
      setSettings(s);
      try {
        setMapStatus(await api<MapStatusResponse>("/api/admin/settings/maps/status"));
      } catch {
        setMapStatus(null);
      }
      try {
        setIntegrationStatus(await api<IntegrationStatusResponse>("/api/admin/settings/integrations/status"));
      } catch {
        setIntegrationStatus(null);
      }
      setForm({
        commissionRate: String(s.commissionRate),
        defaultCommissionLimit: String(s.defaultCommissionLimit),
        platformName: s.platformName || "Athoo",
        supportPhone: s.supportPhone || "+92 339 0051068",
        supportEmail: s.supportEmail || "support@athoo.pk",
        maintenanceMode: Boolean(s.maintenanceMode),
        defaultVisitCharge: String(s.defaultVisitCharge ?? 200),
        maxBookingsPerDay: String(s.maxBookingsPerDay ?? 10),
        appVersion: s.appVersion || "1.0.0",
        minBookingNoticeHours: String(s.minBookingNoticeHours ?? 1),
        allowGuestBrowsing: s.allowGuestBrowsing !== false,
        providerAutoApprove: Boolean(s.providerAutoApprove),
        bookingCancellationWindowHours: String(s.bookingCancellationWindowHours ?? 1),
        broadcastTTLMinutes: String(s.broadcastTTLMinutes ?? 30),
        broadcastInitialRadiusKm: String(s.broadcastInitialRadiusKm ?? 30),
        broadcastExpansionRadiusKm: String(s.broadcastExpansionRadiusKm ?? 50),
        broadcastExpandAfterMinutes: String(s.broadcastExpandAfterMinutes ?? 5),
        maxNegotiationRounds: String(s.maxNegotiationRounds ?? 3),
        premiumCommissionDiscountPercent: String(s.premiumCommissionDiscountPercent ?? 0),
        premiumPriorityBoost: s.premiumPriorityBoost !== false,
        premiumProfileBadgeEnabled: s.premiumProfileBadgeEnabled !== false,
        defaultServiceRadiusKm: String(s.defaultServiceRadiusKm ?? 25),
        customerCancellationFee: String(s.customerCancellationFee ?? 0),
        providerCancellationPenalty: String(s.providerCancellationPenalty ?? 0),
        inactivityLifecycleEnabled: s.inactivityLifecycleEnabled !== false,
        inactivityWarningDays: String(s.inactivityWarningDays ?? 60),
        inactivityRestrictionDays: String(s.inactivityRestrictionDays ?? 90),
        inactivityReviewDays: String(s.inactivityReviewDays ?? 180),
        mapRuntimeConfigurationEnabled: Boolean(s.mapRuntimeConfigurationEnabled),
        mapPrimaryProvider: s.mapPrimaryProvider || "environment",
        mapTileProvider: s.mapTileProvider || "environment",
        mapSearchProvider: s.mapSearchProvider || "environment",
        mapReverseProvider: s.mapReverseProvider || "environment",
        mapDirectionsProvider: s.mapDirectionsProvider || "environment",
        mapProviderFallbackEnabled: Boolean(s.mapProviderFallbackEnabled),
        mapSearchFallbackProvider: s.mapSearchFallbackProvider || "environment",
        mapReverseFallbackProvider: s.mapReverseFallbackProvider || "environment",
        mapDirectionsFallbackProvider: s.mapDirectionsFallbackProvider || "environment",
        communicationRuntimeConfigurationEnabled: Boolean(s.communicationRuntimeConfigurationEnabled),
        emailProvider: s.emailProvider || "environment",
        pushProvider: s.pushProvider || "environment",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(form.commissionRate);
    const limit = Number(form.defaultCommissionLimit);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setError("Commission rate must be 0–100."); return; }
    if (!Number.isFinite(limit) || limit < 100) { setError("Commission limit must be at least Rs. 100."); return; }
    const warningDays = Number(form.inactivityWarningDays);
    const restrictionDays = Number(form.inactivityRestrictionDays);
    const reviewDays = Number(form.inactivityReviewDays);
    const broadcastTTLMinutes = Number(form.broadcastTTLMinutes);
    const broadcastExpandAfterMinutes = Number(form.broadcastExpandAfterMinutes);
    const broadcastInitialRadiusKm = Number(form.broadcastInitialRadiusKm);
    const broadcastExpansionRadiusKm = Number(form.broadcastExpansionRadiusKm);
    if (!Number.isInteger(broadcastTTLMinutes) || broadcastTTLMinutes < 1 || broadcastTTLMinutes > 60) { setError("Broadcast TTL must be between 1 and 60 minutes."); return; }
    if (!Number.isInteger(broadcastExpandAfterMinutes) || broadcastExpandAfterMinutes < 1 || broadcastExpandAfterMinutes >= broadcastTTLMinutes) { setError("Broadcast expansion must run at least 1 minute before the broadcast expires."); return; }
    if (!Number.isFinite(broadcastInitialRadiusKm) || broadcastInitialRadiusKm < 1 || broadcastInitialRadiusKm > 100) { setError("Initial broadcast radius must be between 1 and 100 km."); return; }
    if (!Number.isFinite(broadcastExpansionRadiusKm) || broadcastExpansionRadiusKm < broadcastInitialRadiusKm || broadcastExpansionRadiusKm > 200) { setError("Expanded broadcast radius must be at least the initial radius and no more than 200 km."); return; }
    if (!Number.isInteger(warningDays) || warningDays < 7) { setError("Inactivity warning must be at least 7 days."); return; }
    if (!Number.isInteger(restrictionDays) || restrictionDays <= warningDays) { setError("Restriction days must be greater than warning days."); return; }
    if (!Number.isInteger(reviewDays) || reviewDays <= restrictionDays) { setError("Review days must be greater than restriction days."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          commissionRate: rate,
          defaultCommissionLimit: limit,
          platformName: form.platformName.trim(),
          supportPhone: form.supportPhone.trim(),
          supportEmail: form.supportEmail.trim(),
          maintenanceMode: form.maintenanceMode,
          defaultVisitCharge: Number(form.defaultVisitCharge),
          maxBookingsPerDay: Number(form.maxBookingsPerDay),
          appVersion: form.appVersion.trim(),
          minBookingNoticeHours: Number(form.minBookingNoticeHours),
          allowGuestBrowsing: form.allowGuestBrowsing,
          providerAutoApprove: form.providerAutoApprove,
          bookingCancellationWindowHours: Number(form.bookingCancellationWindowHours),
          broadcastTTLMinutes,
          broadcastInitialRadiusKm,
          broadcastExpansionRadiusKm,
          broadcastExpandAfterMinutes,
          maxNegotiationRounds: Number(form.maxNegotiationRounds),
          premiumCommissionDiscountPercent: Number(form.premiumCommissionDiscountPercent),
          premiumPriorityBoost: form.premiumPriorityBoost,
          premiumProfileBadgeEnabled: form.premiumProfileBadgeEnabled,
          defaultServiceRadiusKm: Number(form.defaultServiceRadiusKm),
          customerCancellationFee: Number(form.customerCancellationFee),
          providerCancellationPenalty: Number(form.providerCancellationPenalty),
          inactivityLifecycleEnabled: form.inactivityLifecycleEnabled,
          inactivityWarningDays: warningDays,
          inactivityRestrictionDays: restrictionDays,
          inactivityReviewDays: reviewDays,
          mapRuntimeConfigurationEnabled: form.mapRuntimeConfigurationEnabled,
          mapPrimaryProvider: form.mapPrimaryProvider,
          mapTileProvider: form.mapTileProvider,
          mapSearchProvider: form.mapSearchProvider,
          mapReverseProvider: form.mapReverseProvider,
          mapDirectionsProvider: form.mapDirectionsProvider,
          mapProviderFallbackEnabled: form.mapProviderFallbackEnabled,
          mapSearchFallbackProvider: form.mapSearchFallbackProvider,
          mapReverseFallbackProvider: form.mapReverseFallbackProvider,
          mapDirectionsFallbackProvider: form.mapDirectionsFallbackProvider,
          communicationRuntimeConfigurationEnabled: form.communicationRuntimeConfigurationEnabled,
          emailProvider: form.emailProvider,
          pushProvider: form.pushProvider,
        }),
      });
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function testMapConfiguration() {
    setMapTesting(true);
    setMapTestMessage("");
    try {
      const response = await api<{ tests: Record<string, any> }>("/api/admin/settings/maps/test", { method: "POST" });
      const tests = response.tests || {};
      const operations = ["tile", "search", "reverse", "directions"];
      const passed = operations.filter(operation => tests[operation]?.ok).length;
      const skipped = operations.filter(operation => tests[operation]?.skipped).length;
      setMapTestMessage(`${passed} map operations passed${skipped ? `; ${skipped} skipped` : ""}.`);
      try {
        setMapStatus(await api<MapStatusResponse>("/api/admin/settings/maps/status"));
      } catch {
        // The test response is still useful when status refresh fails.
      }
    } catch (e) {
      setMapTestMessage((e as Error).message || "Map provider test failed");
    } finally {
      setMapTesting(false);
    }
  }


  async function refreshIntegrationStatus() {
    try {
      setIntegrationStatus(await api<IntegrationStatusResponse>("/api/admin/settings/integrations/status"));
    } catch (e) {
      setError((e as Error).message || "Failed to refresh integration status");
    }
  }

  async function testStorageConfiguration() {
    setStorageTesting(true);
    setStorageTestMessage("");
    try {
      const result = await api<{
        ok: boolean;
        provider: string;
        adapter: string;
        latencyMs: number;
        writeVerified: boolean;
        statVerified: boolean;
        deleteVerified: boolean;
      }>("/api/admin/settings/integrations/storage/test", { method: "POST" });
      setStorageTestMessage(
        result.ok
          ? `${result.provider} storage passed write, verify, and cleanup checks in ${result.latencyMs} ms.`
          : `${result.provider || "Storage"} connectivity test failed.`,
      );
      await refreshIntegrationStatus();
    } catch (e) {
      setStorageTestMessage((e as Error).message || "Storage provider test failed");
    } finally {
      setStorageTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        <span className="text-sm">Loading settings...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Platform Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure all operational parameters for {settings?.platformName || "Athoo"}</p>
          {!canWrite && <p className="text-xs text-amber-700 mt-1">Read-only access. Settings changes require settings.write.</p>}
        </div>
        <button
          type="submit"
          disabled={saving || !canWrite}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shadow-sm"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving..." : "Save All"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} className="shrink-0" /> All settings saved successfully.
        </div>
      )}

      {form.maintenanceMode && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Maintenance Mode is Active</p>
            <p className="text-xs text-amber-700 mt-0.5">New bookings are blocked app-wide. Existing jobs can still be completed.</p>
          </div>
        </div>
      )}

      <Section title="Platform Identity" icon={Globe}>
        <Field label="Platform Name" hint="Shown in app headers, communications, and emails.">
          <TInput value={form.platformName} onChange={v => set("platformName", v)} placeholder="Athoo" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="App Version" hint="Current production release.">
            <TInput value={form.appVersion} onChange={v => set("appVersion", v)} placeholder="1.0.0" />
          </Field>
          <Field label="Maintenance Mode" hint="Immediately blocks all new bookings.">
            <Toggle
              value={form.maintenanceMode}
              onChange={v => set("maintenanceMode", v)}
              onLabel="Active — app paused"
              offLabel="Off — app live"
            />
          </Field>
        </div>
      </Section>

      <Section title="Maps & Location Providers" icon={MapPinned}>
        <Field label="Runtime Provider Control" hint="Switch configured map services from the admin panel without editing code or rebuilding the mobile app.">
          <Toggle
            value={form.mapRuntimeConfigurationEnabled}
            onChange={value => set("mapRuntimeConfigurationEnabled", value)}
            onLabel="On — admin selection active"
            offLabel="Off — deployment environment active"
          />
        </Field>

        <div className={`rounded-xl border p-4 ${mapStatus?.status.configured ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {mapStatus?.status.configured ? <CheckCircle size={18} className="text-emerald-600 mt-0.5" /> : <AlertTriangle size={18} className="text-amber-600 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {mapStatus?.status.configured ? `Active map provider: ${mapStatus.status.provider}` : "Map provider needs configuration"}
              </p>
              {mapStatus?.configuration && (
                <p className="text-xs text-slate-600 mt-1">
                  Tiles: {mapStatus.configuration.tileProvider} · Search: {mapStatus.configuration.searchProvider} · Reverse: {mapStatus.configuration.reverseProvider} · Directions: {mapStatus.configuration.directionsProvider}
                </p>
              )}
              {mapStatus?.status.error && <p className="text-xs text-amber-800 mt-1">{mapStatus.status.error}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Primary Provider" hint="Sets provider defaults; individual operations below may override it.">
            <TSelect value={form.mapPrimaryProvider} onChange={value => set("mapPrimaryProvider", value)} options={PRIMARY_MAP_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
          </Field>
          <Field label="Tile Provider" hint="Map imagery shown in the app.">
            <TSelect value={form.mapTileProvider} onChange={value => set("mapTileProvider", value)} options={TILE_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
          </Field>
          <Field label="Address Search Provider">
            <TSelect value={form.mapSearchProvider} onChange={value => set("mapSearchProvider", value)} options={SEARCH_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
          </Field>
          <Field label="Reverse Geocoding Provider">
            <TSelect value={form.mapReverseProvider} onChange={value => set("mapReverseProvider", value)} options={SEARCH_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
          </Field>
          <Field label="Directions Provider">
            <TSelect value={form.mapDirectionsProvider} onChange={value => set("mapDirectionsProvider", value)} options={DIRECTIONS_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
          </Field>
          <Field label="Provider Fallback" hint="Uses secondary providers only when the selected primary operation fails.">
            <Toggle
              value={form.mapProviderFallbackEnabled}
              onChange={value => set("mapProviderFallbackEnabled", value)}
              onLabel="On — fallback enabled"
              offLabel="Off — primary only"
            />
          </Field>
        </div>

        {form.mapProviderFallbackEnabled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Search Fallback">
              <TSelect value={form.mapSearchFallbackProvider} onChange={value => set("mapSearchFallbackProvider", value)} options={SEARCH_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
            </Field>
            <Field label="Reverse Fallback">
              <TSelect value={form.mapReverseFallbackProvider} onChange={value => set("mapReverseFallbackProvider", value)} options={SEARCH_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
            </Field>
            <Field label="Directions Fallback">
              <TSelect value={form.mapDirectionsFallbackProvider} onChange={value => set("mapDirectionsFallbackProvider", value)} options={DIRECTIONS_PROVIDER_OPTIONS} disabled={!form.mapRuntimeConfigurationEnabled} />
            </Field>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <button
            type="button"
            onClick={testMapConfiguration}
            disabled={mapTesting || !canWrite}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-sm font-medium text-slate-700"
          >
            {mapTesting ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />}
            {mapTesting ? "Testing providers…" : "Test Active Providers"}
          </button>
          {mapTestMessage && <p className="text-xs text-slate-600">{mapTestMessage}</p>}
          <p className="text-xs text-slate-500 sm:ml-auto">API keys remain protected in Render environment variables and are never returned to the browser.</p>
        </div>
      </Section>

      <Section title="Communication & External Providers" icon={RadioTower}>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          Provider credentials stay in Render or your deployment secret manager. This screen only chooses among configured adapters, so secrets are never stored in the database or sent to the browser.
        </div>

        <Field label="Runtime Provider Control" hint="Switch email and push adapters without changing code or rebuilding the mobile app.">
          <Toggle
            value={form.communicationRuntimeConfigurationEnabled}
            onChange={value => set("communicationRuntimeConfigurationEnabled", value)}
            onLabel="On — admin selections active"
            offLabel="Off — deployment environment active"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email Provider" hint="SMTP works with Zoho, SES SMTP, Postmark SMTP, Mailgun SMTP and other standards-compatible services.">
            <TSelect value={form.emailProvider} onChange={value => set("emailProvider", value)} options={EMAIL_PROVIDER_OPTIONS} disabled={!form.communicationRuntimeConfigurationEnabled} />
          </Field>
          <Field label="Push Provider" hint="Use Expo or a configured vendor-neutral JSON-over-HTTPS gateway.">
            <TSelect value={form.pushProvider} onChange={value => set("pushProvider", value)} options={PUSH_PROVIDER_OPTIONS} disabled={!form.communicationRuntimeConfigurationEnabled} />
          </Field>
        </div>

        {integrationStatus && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <IntegrationCard label="Email" item={integrationStatus.integrations.email} icon={Mail} />
            <IntegrationCard label="Push" item={integrationStatus.integrations.push} icon={BellRing} />
            <IntegrationCard label="Storage" item={integrationStatus.integrations.storage} icon={HardDrive} />
            <IntegrationCard label="Calls" item={integrationStatus.integrations.calls} icon={Phone} />
            <IntegrationCard label="Maps" item={integrationStatus.integrations.maps} icon={MapPinned} />
            <IntegrationCard label="OTP" item={integrationStatus.integrations.otp} icon={Shield} />
            <IntegrationCard label="Queue" item={integrationStatus.integrations.queue} icon={Route} />
            <IntegrationCard label="Cache" item={integrationStatus.integrations.cache} icon={Globe} />
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <button
            type="button"
            onClick={refreshIntegrationStatus}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm font-medium text-slate-700"
          >
            <RefreshCw size={15} />
            Refresh Provider Status
          </button>
          <button
            type="button"
            onClick={testStorageConfiguration}
            disabled={storageTesting || !canWrite}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-sm font-medium text-slate-700"
          >
            {storageTesting ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
            {storageTesting ? "Testing storage…" : "Test Storage"}
          </button>
          {canTestEmail && <TestEmailButton />}
          <p className="text-xs text-slate-500 sm:ml-auto">Storage vendors switch without source changes through deployment configuration; migrate and verify objects before restarting on a new provider. Memory cache is certified for one API instance; Redis remains fail-closed until its shared adapter is implemented.</p>
        </div>
        {storageTestMessage && (
          <p className={`text-xs ${storageTestMessage.includes("passed") ? "text-emerald-700" : "text-amber-700"}`}>{storageTestMessage}</p>
        )}
      </Section>

      <Section title="Commission & Finance" icon={DollarSign}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Commission Rate" hint={`Deducted from each completed job. Currently ${settings?.commissionRate ?? 0}%.`}>
            <TInput value={form.commissionRate} onChange={v => set("commissionRate", v)} type="number" suffix="%" />
          </Field>
          <Field label="Commission Due Limit (Rs.)" hint="Providers blocked when dues exceed this.">
            <TInput value={form.defaultCommissionLimit} onChange={v => set("defaultCommissionLimit", v)} type="number" prefix="Rs." />
          </Field>
        </div>
      </Section>

      <Section title="Booking Rules" icon={Clock}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Minimum Booking Notice" hint="Earliest booking a customer can place.">
            <TInput value={form.minBookingNoticeHours} onChange={v => set("minBookingNoticeHours", v)} type="number" suffix="hours" />
          </Field>
          <Field label="Free Cancellation Window" hint="Customer can cancel free within this period.">
            <TInput value={form.bookingCancellationWindowHours} onChange={v => set("bookingCancellationWindowHours", v)} type="number" suffix="hours" />
          </Field>
        </div>
        <Field label="Max Bookings Per Day (per provider)" hint="Guards against overbooking individual providers.">
          <TInput value={form.maxBookingsPerDay} onChange={v => set("maxBookingsPerDay", v)} type="number" suffix="jobs/day" />
        </Field>
      </Section>

      <Section title="Provider Controls" icon={Users}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Auto-Approve New Providers" hint="Skip KYC manual review — not recommended for production.">
            <Toggle
              value={form.providerAutoApprove}
              onChange={v => set("providerAutoApprove", v)}
              onLabel="On — auto-approve"
              offLabel="Off — manual review"
            />
          </Field>
          <Field label="Guest Browsing" hint="Allow unauthenticated users to browse service listings.">
            <Toggle
              value={form.allowGuestBrowsing}
              onChange={v => set("allowGuestBrowsing", v)}
              onLabel="On — public access"
              offLabel="Off — login required"
            />
          </Field>
        </div>
      </Section>

      <Section title="Support Contact" icon={Phone}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Support Phone" hint="Displayed in customer Help & FAQs screen.">
            <TInput value={form.supportPhone} onChange={v => set("supportPhone", v)} placeholder="+92 300 0000000" />
          </Field>
          <Field label="Support Email" hint="For escalations and formal complaints.">
            <TInput value={form.supportEmail} onChange={v => set("supportEmail", v)} placeholder="support@athoo.pk" type="email" />
          </Field>
        </div>
        {canTestEmail && <TestEmailButton />}
      </Section>

      <Section title="Broadcast & Service Area" icon={Megaphone}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Broadcast TTL" hint="Total minutes a broadcast request stays open before expiring.">
            <TInput value={form.broadcastTTLMinutes} onChange={v => set("broadcastTTLMinutes", v)} type="number" suffix="minutes" />
          </Field>
          <Field label="Default Service Radius" hint="Default search radius when no custom area is set for a provider.">
            <TInput value={form.defaultServiceRadiusKm} onChange={v => set("defaultServiceRadiusKm", v)} type="number" suffix="km" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Initial Broadcast Radius" hint="Providers within this distance are notified immediately.">
            <TInput value={form.broadcastInitialRadiusKm} onChange={v => set("broadcastInitialRadiusKm", v)} type="number" suffix="km" />
          </Field>
          <Field label="Expanded Broadcast Radius" hint="Radius used after the expand timer fires.">
            <TInput value={form.broadcastExpansionRadiusKm} onChange={v => set("broadcastExpansionRadiusKm", v)} type="number" suffix="km" />
          </Field>
          <Field label="Expand After" hint="Minutes after creation before radius expands.">
            <TInput value={form.broadcastExpandAfterMinutes} onChange={v => set("broadcastExpandAfterMinutes", v)} type="number" suffix="min" />
          </Field>
        </div>
      </Section>

      <Section title="Negotiation" icon={MessageSquare}>
        <Field label="Max Negotiation Rounds" hint="Maximum counter-offers allowed before a broadcast expires. Minimum 1.">
          <TInput value={form.maxNegotiationRounds} onChange={v => set("maxNegotiationRounds", v)} type="number" suffix="rounds" />
        </Field>
      </Section>

      <Section title="Premium Membership" icon={Crown}>
        <Field label="Commission Discount for Premium Providers" hint="Percentage deducted from the commission rate for active premium providers. Set 0 to disable.">
          <TInput value={form.premiumCommissionDiscountPercent} onChange={v => set("premiumCommissionDiscountPercent", v)} type="number" suffix="%" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Priority Boost in Search" hint="Premium providers appear higher in customer search results.">
            <Toggle
              value={form.premiumPriorityBoost}
              onChange={v => set("premiumPriorityBoost", v)}
              onLabel="On — boosted"
              offLabel="Off — same rank"
            />
          </Field>
          <Field label="Show Premium Badge" hint="Display a Crown badge on premium provider profiles.">
            <Toggle
              value={form.premiumProfileBadgeEnabled}
              onChange={v => set("premiumProfileBadgeEnabled", v)}
              onLabel="Badge visible"
              offLabel="Badge hidden"
            />
          </Field>
        </div>
      </Section>


      <Section title="Inactive Account Lifecycle" icon={Clock}>
        <Field label="Lifecycle Automation" hint="Warns inactive users, pauses provider matching, and creates an admin review item. Permanent deletion is never automatic.">
          <Toggle
            value={form.inactivityLifecycleEnabled}
            onChange={v => set("inactivityLifecycleEnabled", v)}
            onLabel="On — lifecycle active"
            offLabel="Off — no automatic actions"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Warning After" hint="Send an in-app and email reminder.">
            <TInput value={form.inactivityWarningDays} onChange={v => set("inactivityWarningDays", v)} type="number" suffix="days" />
          </Field>
          <Field label="Restrict After" hint="Pause provider matching until they return.">
            <TInput value={form.inactivityRestrictionDays} onChange={v => set("inactivityRestrictionDays", v)} type="number" suffix="days" />
          </Field>
          <Field label="Admin Review After" hint="Add the account to the review queue; do not delete it.">
            <TInput value={form.inactivityReviewDays} onChange={v => set("inactivityReviewDays", v)} type="number" suffix="days" />
          </Field>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Deletion safeguard</p>
          <p className="mt-1 text-xs leading-5">Inactivity alone never permanently deletes an account. Deletion remains a separate seven-day user-requested workflow or an explicitly audited administrative decision.</p>
        </div>
      </Section>

      <Section title="Cancellation Fees" icon={Slash}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Customer Late Cancellation Fee (Rs.)" hint="Charged when a customer cancels after the free window expires. Set 0 to disable.">
            <TInput value={form.customerCancellationFee} onChange={v => set("customerCancellationFee", v)} type="number" prefix="Rs." />
          </Field>
          <Field label="Provider Rejection Penalty (Rs.)" hint="Deducted from provider when they reject or abandon an accepted job. Set 0 to disable.">
            <TInput value={form.providerCancellationPenalty} onChange={v => set("providerCancellationPenalty", v)} type="number" prefix="Rs." />
          </Field>
        </div>
      </Section>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield size={13} /> How commission works
        </h4>
        <div className="space-y-2 text-sm text-slate-600">
          <p>When a booking is completed, the platform deducts the commission rate from the job price. Providers accumulate pending dues which they must pay to Athoo.</p>
          <p>Once pending dues reach the commission due limit, the provider is automatically blocked from receiving new bookings until they clear their balance.</p>
          <p>Admins can manually mark individual providers as paid from the Finance or Providers pages.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !canWrite}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors text-sm shadow-sm"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </form>
  );
}
