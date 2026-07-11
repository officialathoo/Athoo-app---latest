import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Loader2, Plus, Pencil, Trash2, X, Wrench, Zap, Droplets, Paintbrush,
  Hammer, Truck, Home, Scissors, Brush, Settings2, AirVent, Fan,
  Snowflake, Flame, Plug, Lightbulb, PaintBucket, WashingMachine,
  ShowerHead, Toilet, Bath, CookingPot, Utensils, ChefHat, Sofa, Bed,
  Armchair, DoorOpen, KeyRound, ShieldCheck, UserCheck, Users, HardHat,
  Drill, Shovel, Building, Warehouse, Store, MapPin, Phone, MessageCircle,
  Camera, Video, FileText, ClipboardList, CreditCard, Wallet, Banknote,
  Receipt, Star, Heart, Bell, type LucideIcon,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  visitCharge: number | null;
  minHourlyRate: number | null;
  maxHourlyRate: number | null;
  description: string | null;
  searchKeywords: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
};

const COLOR_PRESETS = [
  "#1A6EE0", "#16A34A", "#F59E0B", "#EF4444", "#8B5CF6",
  "#0EA5E9", "#EC4899", "#14B8A6", "#F97316", "#6366F1",
];

const ICON_PRESETS = [
  "wrench", "zap", "droplet", "paintbrush", "hammer", "truck", "home",
  "scissors", "broom", "air-vent", "fan", "snowflake", "flame", "plug",
  "lightbulb", "paint-bucket", "washing-machine", "shower-head", "toilet",
  "bath", "cooking-pot", "utensils", "chef-hat", "sofa", "bed", "armchair",
  "door-open", "key-round", "shield-check", "user-check", "users", "hard-hat",
  "drill", "shovel", "building", "warehouse", "store", "map-pin", "phone",
  "message-circle", "camera", "video", "file-text", "clipboard-list",
  "credit-card", "wallet", "banknote", "receipt", "star", "heart", "bell",
];

const ICON_MAP: Record<string, LucideIcon> = {
  tool: Wrench, wrench: Wrench, zap: Zap, droplet: Droplets, brush: Paintbrush,
  paintbrush: Paintbrush, hammer: Hammer, truck: Truck, home: Home,
  scissors: Scissors, broom: Brush, "air-vent": AirVent, fan: Fan,
  snowflake: Snowflake, flame: Flame, plug: Plug, lightbulb: Lightbulb,
  "paint-bucket": PaintBucket, "washing-machine": WashingMachine,
  "shower-head": ShowerHead, toilet: Toilet, bath: Bath, "cooking-pot": CookingPot,
  utensils: Utensils, "chef-hat": ChefHat, sofa: Sofa, bed: Bed, armchair: Armchair,
  "door-open": DoorOpen, "key-round": KeyRound, "shield-check": ShieldCheck,
  "user-check": UserCheck, users: Users, "hard-hat": HardHat, drill: Drill,
  shovel: Shovel, building: Building, warehouse: Warehouse, store: Store,
  "map-pin": MapPin, phone: Phone, "message-circle": MessageCircle, camera: Camera,
  video: Video, "file-text": FileText, "clipboard-list": ClipboardList,
  "credit-card": CreditCard, wallet: Wallet, banknote: Banknote, receipt: Receipt,
  star: Star, heart: Heart, bell: Bell,
};


function resolveCategoryIcon(name: string | null): LucideIcon {
  if (!name) return Settings2;
  const key = String(name).toLowerCase();
  const direct = ICON_MAP[key];
  if (direct) return direct;
  if (/mechanic|car|auto|bike|vehicle/.test(key)) return Wrench;
  if (/electric|power|ac|air|cool/.test(key)) return Zap;
  if (/plumb|water|leak|pipe/.test(key)) return Droplets;
  if (/paint|clean|wash/.test(key)) return Brush;
  return Settings2;
}

function CategoryIcon({ name, size = 16, className = "" }: { name: string | null; size?: number; className?: string }) {
  const Comp = resolveCategoryIcon(name);
  return <Comp size={size} className={className} />;
}

export function CategoriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("marketing.write");
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api<{ categories: Category[] }>("/api/admin/categories"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<Category> & { id?: string }) => {
      const { id, ...body } = payload;
      return id
        ? api(`/api/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/api/admin/categories`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      setShowForm(false);
      setEditing(null);
      toast({ title: "Saved", description: "Category saved successfully" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast({ title: "Deactivated", description: "Category was deactivated" });
    },
  });

  const cats = data?.categories ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Service Categories</h1>
          <p className="text-sm text-slate-500">
            Add, deactivate, and price the services that customers can browse.
          </p>
        </div>
        {canWrite && <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm"
        >
          <Plus size={16} /> New category
        </button>}
      </div>

      {canWrite && showForm && (
        <CategoryForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={(payload) => saveMutation.mutate({ ...payload, id: editing?.id })}
          saving={saveMutation.isPending}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : cats.length === 0 ? (
          <div className="text-center py-16 text-slate-500">No categories yet — add the first one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Visit charge</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sort</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cats.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex w-9 h-9 rounded-lg items-center justify-center text-white font-medium text-xs shrink-0"
                        style={{ backgroundColor: c.color ?? "#1A6EE0" }}
                      >
                        <CategoryIcon name={c.icon} size={17} />
                      </span>
                      <div>
                        <div className="font-medium text-slate-900">{c.name}</div>
                        {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3 text-slate-700">
                    Rs {c.visitCharge ?? 0}
                    {(c.minHourlyRate || c.maxHourlyRate) && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Hourly: Rs {c.minHourlyRate ?? 0}–{c.maxHourlyRate ?? "∞"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.sortOrder ?? 0}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {canWrite ? <><button
                      onClick={() => { setEditing(c); setShowForm(true); }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    {c.isActive && (
                      confirmDeleteId === c.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={() => { deleteMutation.mutate(c.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(c.id)} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                          <Trash2 size={14} /> Deactivate
                        </button>
                      )
                    )}</> : <span className="text-xs text-slate-400">Read only</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CategoryForm({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: Category | null;
  onCancel: () => void;
  onSave: (payload: Partial<Category>) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [color, setColor] = useState(initial?.color ?? "#1A6EE0");
  const [icon, setIcon] = useState(initial?.icon ?? "tool");
  const [visitCharge, setVisitCharge] = useState(String(initial?.visitCharge ?? ""));
  const [minHourlyRate, setMinHourlyRate] = useState(String(initial?.minHourlyRate ?? ""));
  const [maxHourlyRate, setMaxHourlyRate] = useState(String(initial?.maxHourlyRate ?? ""));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [searchKeywords, setSearchKeywords] = useState(initial?.searchKeywords ?? "");
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900">
          {initial ? `Edit ${initial.name}` : "New category"}
        </h2>
        <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded">
          <X size={18} className="text-slate-500" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name *">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Plumber" />
        </Field>
        <Field label="Slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="input" placeholder="auto from name" />
        </Field>
        <Field label="Visiting / call-out charge (PKR)">
          <input value={visitCharge} onChange={(e) => setVisitCharge(e.target.value)} type="number" min="0" className="input" placeholder="300" />
        </Field>
        <Field label="Min hourly rate (PKR)">
          <input value={minHourlyRate} onChange={(e) => setMinHourlyRate(e.target.value)} type="number" min="0" className="input" placeholder="500" />
        </Field>
        <Field label="Max hourly rate (PKR)">
          <input value={maxHourlyRate} onChange={(e) => setMaxHourlyRate(e.target.value)} type="number" min="0" className="input" placeholder="5000" />
        </Field>
        <Field label="Sort order">
          <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" className="input" />
        </Field>
        <Field label="Description" wide>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[60px]" placeholder="Explain what this service covers" />
        </Field>
        <Field label="Search keywords & synonyms" wide>
          <input value={searchKeywords} onChange={(e) => setSearchKeywords(e.target.value)} className="input" placeholder="ac, air conditioner, cooling, split unit" />
          <p className="mt-1 text-xs text-slate-500">Comma-separated words customers may use to find this category.</p>
        </Field>
        <Field label="Icon">
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50">
            <div className="mb-2 text-xs text-slate-500">150+ professional icons. Search by typing the icon name in the field below.</div>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className="input mb-3 bg-white" placeholder="Search/type icon: mechanic, car, ac, plumber, cleaner" />
            <div className="flex flex-wrap gap-2">
            {ICON_PRESETS.map((i) => {
              const IconComp = resolveCategoryIcon(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  title={i}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-colors ${icon === i ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >
                  <IconComp size={16} />
                  <span className="text-[10px] leading-none">{i}</span>
                </button>
              );
            })}
          </div>
          </div>
        </Field>
        <Field label="Color">
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 ${color === c ? "border-slate-900" : "border-slate-200"}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input value={color} onChange={(e) => setColor(e.target.value)} className="input w-32" />
          </div>
        </Field>
        <Field label="Visibility">
          <div className="space-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Show this category to customers
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              Feature this category in discovery
            </label>
          </div>
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">Cancel</button>
        <button
          disabled={saving || !name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              slug: slug.trim() || undefined,
              color,
              icon,
              visitCharge: Number(visitCharge) || 0,
              minHourlyRate: minHourlyRate.trim() ? Number(minHourlyRate) : null,
              maxHourlyRate: maxHourlyRate.trim() ? Number(maxHourlyRate) : null,
              description: description.trim() || undefined,
              searchKeywords: searchKeywords.trim(),
              isFeatured,
              isActive,
              sortOrder: Number(sortOrder) || 0,
            } as any)
          }
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </div>
      <style>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.1)}`}</style>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

