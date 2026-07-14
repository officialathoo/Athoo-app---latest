import { useState } from "react";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { AdvancedGradientPicker } from "@/components/admin/AdvancedColorPicker";
import { IconPicker } from "@/components/admin/IconPicker";
import { SearchableSelect } from "@/components/admin/SearchableSelect";
import {
  Megaphone, Plus, Pencil, Trash2, X, Check, Loader2,
  ToggleLeft, ToggleRight, Image, Bell, MapPin, Star,
  Users, UserCog, Globe, Eye, EyeOff, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  bgColorFrom: string;
  bgColorTo: string;
  iconName: string;
  linkType: string;
  linkTarget?: string | null;
  targetAudience: string;
  isActive: boolean;
  sortOrder: number;
  expiresAt?: string | null;
  createdAt: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  buttonText: string;
  buttonLink?: string | null;
  imageUrl?: string | null;
  targetAudience: string;
  isActive: boolean;
  showOnce: boolean;
  priority: number;
  expiresAt?: string | null;
  createdAt: string;
}

interface HomeConfig {
  id: string;
  locationLabel: string;
  showBroadcastCta: boolean;
  showPlatformStats: boolean;
  showTopProviders: boolean;
  showEmergencyContacts: boolean;
  maxCategories: number;
  maxProviders: number;
}


interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
}

interface Area {
  id: string;
  name: string;
  province?: string | null;
  isActive: boolean;
  sortOrder: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AUDIENCE_OPTS = [
  { value: "all", label: "Everyone", icon: <Globe size={13} /> },
  { value: "customer", label: "Customers", icon: <Users size={13} /> },
  { value: "provider", label: "Providers", icon: <UserCog size={13} /> },
];

function AudienceBadge({ audience }: { audience: string }) {
  const map: Record<string, { label: string; color: string }> = {
    all: { label: "Everyone", color: "bg-slate-100 text-slate-700" },
    customer: { label: "Customers", color: "bg-blue-100 text-blue-700" },
    provider: { label: "Providers", color: "bg-purple-100 text-purple-700" },
  };
  const info = map[audience] || map["all"];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Banner Modal ─────────────────────────────────────────────────────────────
interface BannerFormData {
  title: string; subtitle: string; imageUrl: string;
  bgColorFrom: string; bgColorTo: string; iconName: string;
  linkType: string; linkTarget: string; targetAudience: string;
  isActive: boolean; sortOrder: string; expiresAt: string;
}

const EMPTY_BANNER: BannerFormData = {
  title: "", subtitle: "", imageUrl: "", bgColorFrom: "#1A6EE0",
  bgColorTo: "#0D4BA0", iconName: "star", linkType: "none",
  linkTarget: "", targetAudience: "all", isActive: true, sortOrder: "0", expiresAt: "",
};

function BannerModal({ mode, initial, categories, onClose, onSave, saving }: {
  mode: "create" | "edit"; initial?: Banner | null; categories: CategoryOption[];
  onClose: () => void; onSave: (d: BannerFormData) => void; saving: boolean;
}) {
  const [form, setForm] = useState<BannerFormData>(
    initial ? {
      title: initial.title, subtitle: initial.subtitle || "",
      imageUrl: initial.imageUrl || "", bgColorFrom: initial.bgColorFrom,
      bgColorTo: initial.bgColorTo, iconName: initial.iconName,
      linkType: initial.linkType, linkTarget: initial.linkTarget || "",
      targetAudience: initial.targetAudience, isActive: initial.isActive,
      sortOrder: String(initial.sortOrder),
      expiresAt: initial.expiresAt ? initial.expiresAt.split("T")[0] : "",
    } : EMPTY_BANNER
  );
  const set = (k: keyof BannerFormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "Create Banner" : "Edit Banner"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Summer AC Service Deal" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Subtitle</label>
            <input value={form.subtitle} onChange={e => set("subtitle", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Short supporting text" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Image URL (optional)</label>
            <input value={form.imageUrl} onChange={e => set("imageUrl", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Background Gradient</label>
            <AdvancedGradientPicker
              from={form.bgColorFrom}
              to={form.bgColorTo}
              onFromChange={(value) => set("bgColorFrom", value)}
              onToChange={(value) => set("bgColorTo", value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Banner Icon</label>
            <IconPicker value={form.iconName} onChange={(value) => set("iconName", value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Preview</label>
            <div className="rounded-xl p-4 text-white text-sm font-semibold shadow-inner"
              style={{ background: `linear-gradient(135deg, ${form.bgColorFrom}, ${form.bgColorTo})` }}>
              <p>{form.title || "Banner Title"}</p>
              {form.subtitle && <p className="text-xs opacity-80 mt-0.5">{form.subtitle}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Link Type</label>
              <select value={form.linkType} onChange={e => set("linkType", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="none">No Link</option>
                <option value="category">Service Category</option>
                <option value="url">External URL</option>
                <option value="booking">New Booking</option>
              </select>
            </div>
            {form.linkType === "category" && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Service Category</label>
                <SearchableSelect
                  value={form.linkTarget}
                  onChange={(value) => set("linkTarget", value)}
                  options={categories.filter((category) => category.isActive).map((category) => ({
                    value: category.slug,
                    label: category.name,
                    description: category.description || category.slug,
                    keywords: [category.slug, category.id],
                  }))}
                  placeholder="Select a live category"
                  searchPlaceholder="Search categories"
                  emptyText="No active categories available"
                />
              </div>
            )}
            {form.linkType === "url" && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">External URL</label>
                <input value={form.linkTarget} onChange={e => set("linkTarget", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Target Audience</label>
              <select value={form.targetAudience} onChange={e => set("targetAudience", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {AUDIENCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={e => set("sortOrder", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Expires At (optional)</label>
              <input type="date" value={form.expiresAt} onChange={e => set("expiresAt", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Status</label>
              <button type="button" onClick={() => set("isActive", !form.isActive)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border w-full ${
                  form.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
                }`}>
                {form.isActive ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                {form.isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {mode === "create" ? "Create Banner" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Announcement Modal ───────────────────────────────────────────────────────
interface AnnouncementFormData {
  title: string; message: string; buttonText: string; buttonLink: string;
  imageUrl: string; targetAudience: string; isActive: boolean;
  showOnce: boolean; priority: string; expiresAt: string;
}

const EMPTY_ANN: AnnouncementFormData = {
  title: "", message: "", buttonText: "Got it", buttonLink: "",
  imageUrl: "", targetAudience: "all", isActive: true, showOnce: true,
  priority: "0", expiresAt: "",
};

function AnnouncementModal({ mode, initial, onClose, onSave, saving }: {
  mode: "create" | "edit"; initial?: Announcement | null;
  onClose: () => void; onSave: (d: AnnouncementFormData) => void; saving: boolean;
}) {
  const [form, setForm] = useState<AnnouncementFormData>(
    initial ? {
      title: initial.title, message: initial.message, buttonText: initial.buttonText,
      buttonLink: initial.buttonLink || "", imageUrl: initial.imageUrl || "",
      targetAudience: initial.targetAudience, isActive: initial.isActive,
      showOnce: initial.showOnce, priority: String(initial.priority),
      expiresAt: initial.expiresAt ? initial.expiresAt.split("T")[0] : "",
    } : EMPTY_ANN
  );
  const set = (k: keyof AnnouncementFormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "New Announcement" : "Edit Announcement"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. App Update Available" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Message *</label>
            <textarea value={form.message} onChange={e => set("message", e.target.value)}
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Write your announcement message here..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Preview</label>
            <div className="bg-slate-50 border rounded-xl p-4 shadow-sm">
              <p className="font-semibold text-slate-800 text-sm">{form.title || "Announcement Title"}</p>
              <p className="text-xs text-slate-500 mt-1">{form.message || "Message text will appear here..."}</p>
              <button className="mt-3 bg-blue-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
                {form.buttonText || "Got it"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Button Text</label>
              <input value={form.buttonText} onChange={e => set("buttonText", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Priority (higher = first)</label>
              <input type="number" value={form.priority} onChange={e => set("priority", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0" max="100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Target Audience</label>
              <select value={form.targetAudience} onChange={e => set("targetAudience", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {AUDIENCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Expires At</label>
              <input type="date" value={form.expiresAt} onChange={e => set("expiresAt", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => set("isActive", !form.isActive)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${
                form.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
              }`}>
              {form.isActive ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
              {form.isActive ? "Active" : "Inactive"}
            </button>
            <button type="button" onClick={() => set("showOnce", !form.showOnce)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${
                form.showOnce ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"
              }`}>
              {form.showOnce ? <Eye size={16} /> : <EyeOff size={16} />}
              {form.showOnce ? "Show Once" : "Always Show"}
            </button>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.title.trim() || !form.message.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type Tab = "home" | "banners" | "announcements" | "areas";

export function MarketingPage() {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("marketing.write");
  const [tab, setTab] = useState<Tab>("home");
  const [bannerModal, setBannerModal] = useState<{ mode: "create" | "edit"; item?: Banner } | null>(null);
  const [annModal, setAnnModal] = useState<{ mode: "create" | "edit"; item?: Announcement } | null>(null);
  const [areaInput, setAreaInput] = useState("");
  const [areaProvince, setAreaProvince] = useState("");

  // Data queries
  const bannersQ = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => api<{ banners: Banner[] }>("/api/admin/marketing/banners"),
  });
  const annsQ = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => api<{ announcements: Announcement[] }>("/api/admin/marketing/announcements"),
  });
  const areasQ = useQuery({
    queryKey: ["admin-areas"],
    queryFn: () => api<{ areas: Area[] }>("/api/admin/service-areas"),
  });
  const categoriesQ = useQuery({
    queryKey: ["admin", "categories", "banner-link-options"],
    queryFn: () => api<{ categories: CategoryOption[] }>("/api/admin/categories"),
    staleTime: 30_000,
  });
  const homeConfigQ = useQuery({
    queryKey: ["admin-home-config"],
    queryFn: () => api<{ config: HomeConfig }>("/api/admin/marketing/home-config"),
  });

  const updateHomeConfig = useMutation({
    mutationFn: (config: HomeConfig) => api<{ config: HomeConfig }>("/api/admin/marketing/home-config", {
      method: "PATCH",
      body: JSON.stringify(config),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: (data) => qc.setQueryData(["admin-home-config"], data),
  });

  // Banner mutations
  const createBanner = useMutation({
    mutationFn: (d: BannerFormData) => api("/api/admin/marketing/banners", {
      method: "POST",
      body: JSON.stringify({ ...d, sortOrder: Number(d.sortOrder), expiresAt: d.expiresAt || null }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-banners"] }); setBannerModal(null); },
  });
  const updateBanner = useMutation({
    mutationFn: ({ id, d }: { id: string; d: BannerFormData }) => api(`/api/admin/marketing/banners/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...d, sortOrder: Number(d.sortOrder), expiresAt: d.expiresAt || null }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-banners"] }); setBannerModal(null); },
  });
  const deleteBanner = useMutation({
    mutationFn: (id: string) => api(`/api/admin/marketing/banners/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });
  const toggleBanner = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/marketing/banners/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  // Announcement mutations
  const createAnn = useMutation({
    mutationFn: (d: AnnouncementFormData) => api("/api/admin/marketing/announcements", {
      method: "POST",
      body: JSON.stringify({ ...d, priority: Number(d.priority), expiresAt: d.expiresAt || null }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-announcements"] }); setAnnModal(null); },
  });
  const updateAnn = useMutation({
    mutationFn: ({ id, d }: { id: string; d: AnnouncementFormData }) => api(`/api/admin/marketing/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...d, priority: Number(d.priority), expiresAt: d.expiresAt || null }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-announcements"] }); setAnnModal(null); },
  });
  const deleteAnn = useMutation({
    mutationFn: (id: string) => api(`/api/admin/marketing/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });
  const toggleAnn = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/marketing/announcements/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });

  // Area mutations
  const createArea = useMutation({
    mutationFn: () => api("/api/admin/service-areas", {
      method: "POST",
      body: JSON.stringify({ name: areaInput.trim(), province: areaProvince.trim() }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-areas"] }); setAreaInput(""); setAreaProvince(""); },
  });
  const toggleArea = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/service-areas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-areas"] }),
  });
  const deleteArea = useMutation({
    mutationFn: (id: string) => api(`/api/admin/service-areas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-areas"] }),
  });

  const banners = bannersQ.data?.banners ?? [];
  const announcements = annsQ.data?.announcements ?? [];
  const areas = areasQ.data?.areas ?? [];
  const categories = categoriesQ.data?.categories ?? [];

  const homeConfig = homeConfigQ.data?.config;

  const TABS = [
    { id: "home" as Tab, label: "Home Setup", icon: <Star size={15} />, count: 1 },
    { id: "banners" as Tab, label: "Banners", icon: <Image size={15} />, count: banners.length },
    { id: "announcements" as Tab, label: "Announcements", icon: <Bell size={15} />, count: announcements.length },
    { id: "areas" as Tab, label: "Service Areas", icon: <MapPin size={15} />, count: areas.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage customer home layout, banners, announcements and service areas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t.icon} {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              tab === t.id ? "bg-blue-100 text-blue-600" : "bg-slate-200 text-slate-500"
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "home" && (
        <div className="bg-white border rounded-2xl p-6 shadow-sm" data-testid="customer-home-admin-settings">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="font-semibold text-slate-800">Customer Home Controls</h2>
              <p className="text-xs text-slate-400 mt-1">Changes apply to the customer home screen without an app update.</p>
            </div>
            <button
              disabled={!canWrite || !homeConfig || updateHomeConfig.isPending}
              onClick={() => homeConfig && updateHomeConfig.mutate(homeConfig)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {updateHomeConfig.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save Home Setup
            </button>
          </div>
          {homeConfigQ.isLoading || !homeConfig ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase">Default location label</span>
                <input
                  disabled={!canWrite}
                  value={homeConfig.locationLabel}
                  onChange={(e) => qc.setQueryData(["admin-home-config"], { config: { ...homeConfig, locationLabel: e.target.value } })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={80}
                />
                <span className="text-xs text-slate-400">A customer profile location overrides this label.</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Visible categories</span>
                  <input disabled={!canWrite} type="number" min={1} max={30} value={homeConfig.maxCategories}
                    onChange={(e) => qc.setQueryData(["admin-home-config"], { config: { ...homeConfig, maxCategories: Number(e.target.value) } })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Top providers</span>
                  <input disabled={!canWrite} type="number" min={1} max={12} value={homeConfig.maxProviders}
                    onChange={(e) => qc.setQueryData(["admin-home-config"], { config: { ...homeConfig, maxProviders: Number(e.target.value) } })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="md:col-span-2 grid sm:grid-cols-2 gap-3">
                {[
                  ["showBroadcastCta", "Broadcast job call-to-action"],
                  ["showPlatformStats", "Platform trust statistics"],
                  ["showTopProviders", "Top providers section"],
                  ["showEmergencyContacts", "Emergency contact cards"],
                ].map(([key, label]) => (
                  <button key={key} type="button" disabled={!canWrite}
                    onClick={() => canWrite && qc.setQueryData(["admin-home-config"], { config: { ...homeConfig, [key]: !homeConfig[key as keyof HomeConfig] } })}
                    className="flex items-center justify-between border rounded-xl p-4 text-left hover:bg-slate-50">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                    {homeConfig[key as keyof HomeConfig] ? <ToggleRight className="text-blue-600" /> : <ToggleLeft className="text-slate-400" />}
                  </button>
                ))}
              </div>
              {updateHomeConfig.isError && <p className="md:col-span-2 text-sm text-red-600">{(updateHomeConfig.error as Error).message}</p>}
              {updateHomeConfig.isSuccess && <p className="md:col-span-2 text-sm text-emerald-600">Customer home configuration saved.</p>}
            </div>
          )}
        </div>
      )}

      {/* Banners Tab */}
      {tab === "banners" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">App Banners</h2>
              <p className="text-xs text-slate-400">Displayed on the customer/provider home screen carousel</p>
            </div>
            <button disabled={!canWrite} onClick={() => canWrite && setBannerModal({ mode: "create" })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              <Plus size={16} /> New Banner
            </button>
          </div>
          {bannersQ.isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : banners.length === 0 ? (
            <div className="text-center py-16 bg-white border rounded-2xl">
              <Image size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No banners yet</p>
              <p className="text-slate-400 text-sm">Create your first promotional banner</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map(b => (
                <div key={b.id} className="bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="h-24 p-4 text-white" style={{ background: `linear-gradient(135deg, ${b.bgColorFrom}, ${b.bgColorTo})` }}>
                    <p className="font-bold">{b.title}</p>
                    {b.subtitle && <p className="text-xs opacity-80 mt-0.5">{b.subtitle}</p>}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AudienceBadge audience={b.targetAudience} />
                        {b.linkType !== "none" && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Link: {b.linkType}
                          </span>
                        )}
                        {b.expiresAt && (
                          <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">
                            Expires {new Date(b.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button disabled={!canWrite} onClick={() => canWrite && toggleBanner.mutate({ id: b.id, isActive: !b.isActive })}
                          className={`p-1.5 rounded-lg transition-colors ${b.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}>
                          {b.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button disabled={!canWrite} onClick={() => canWrite && setBannerModal({ mode: "edit", item: b })}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                          <Pencil size={15} />
                        </button>
                        <button disabled={!canWrite} onClick={() => canWrite && deleteBanner.mutate(b.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Announcements Tab */}
      {tab === "announcements" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">App Announcements</h2>
              <p className="text-xs text-slate-400">Popup messages shown to users on app open</p>
            </div>
            <button disabled={!canWrite} onClick={() => canWrite && setAnnModal({ mode: "create" })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              <Plus size={16} /> New Announcement
            </button>
          </div>
          {annsQ.isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-16 bg-white border rounded-2xl">
              <Bell size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No announcements yet</p>
              <p className="text-slate-400 text-sm">Create a popup announcement for your users</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map(a => (
                <div key={a.id} className="bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-800">{a.title}</p>
                        {a.isActive ? (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                        ) : (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Inactive</span>
                        )}
                        {a.showOnce && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">Show Once</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-2">{a.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <AudienceBadge audience={a.targetAudience} />
                        <span className="text-xs text-slate-400">Priority: {a.priority}</span>
                        {a.expiresAt && (
                          <span className="text-xs text-red-500">Expires {new Date(a.expiresAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button disabled={!canWrite} onClick={() => canWrite && toggleAnn.mutate({ id: a.id, isActive: !a.isActive })}
                        className={`p-1.5 rounded-lg transition-colors ${a.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}>
                        {a.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button disabled={!canWrite} onClick={() => canWrite && setAnnModal({ mode: "edit", item: a })}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                        <Pencil size={15} />
                      </button>
                      <button disabled={!canWrite} onClick={() => canWrite && deleteAnn.mutate(a.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Service Areas Tab */}
      {tab === "areas" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">Service Areas</h2>
              <p className="text-xs text-slate-400">Cities and regions where Athoo operates</p>
            </div>
          </div>
          <div className="bg-white border rounded-2xl p-5 mb-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Add New Area</p>
            <div className="flex gap-3">
              <input disabled={!canWrite} value={areaInput} onChange={e => setAreaInput(e.target.value)}
                placeholder="City name (e.g. Lahore)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input disabled={!canWrite} value={areaProvince} onChange={e => setAreaProvince(e.target.value)}
                placeholder="Province (e.g. Punjab)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => canWrite && createArea.mutate()} disabled={!canWrite || !areaInput.trim() || createArea.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {createArea.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add
              </button>
            </div>
          </div>
          {areasQ.isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {areas.map(area => (
                <div key={area.id} className="bg-white border rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-semibold text-slate-800">{area.name}</p>
                    {area.province && <p className="text-xs text-slate-400">{area.province}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button disabled={!canWrite} onClick={() => canWrite && toggleArea.mutate({ id: area.id, isActive: !area.isActive })}
                      className={`p-1.5 rounded-lg ${area.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}>
                      {area.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button disabled={!canWrite} onClick={() => canWrite && deleteArea.mutate(area.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
              {areas.length === 0 && (
                <div className="col-span-3 text-center py-10 text-slate-400">
                  <MapPin size={28} className="mx-auto mb-2" />
                  No service areas yet
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {canWrite && bannerModal && (
        <BannerModal
          mode={bannerModal.mode}
          initial={bannerModal.item}
          categories={categories}
          onClose={() => setBannerModal(null)}
          onSave={d => bannerModal.mode === "create"
            ? createBanner.mutate(d)
            : updateBanner.mutate({ id: bannerModal.item!.id, d })
          }
          saving={createBanner.isPending || updateBanner.isPending}
        />
      )}
      {canWrite && annModal && (
        <AnnouncementModal
          mode={annModal.mode}
          initial={annModal.item}
          onClose={() => setAnnModal(null)}
          onSave={d => annModal.mode === "create"
            ? createAnn.mutate(d)
            : updateAnn.mutate({ id: annModal.item!.id, d })
          }
          saving={createAnn.isPending || updateAnn.isPending}
        />
      )}
    </div>
  );
}
