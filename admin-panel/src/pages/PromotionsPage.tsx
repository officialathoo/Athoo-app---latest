import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag, Plus, Pencil, Trash2, X, Check, Loader2, Copy, ToggleLeft, ToggleRight } from "lucide-react";

interface Promotion {
  id: string;
  code: string;
  description?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minBookingValue?: number | null;
  maxUses?: number | null;
  usedCount: number;
  validFrom?: string | null;
  validUntil?: string | null;
  serviceTypes?: string[] | null;
  isActive: boolean;
  createdAt: string;
}

interface FormData {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minBookingValue: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

const EMPTY: FormData = {
  code: "", description: "", discountType: "percentage",
  discountValue: "", minBookingValue: "", maxUses: "",
  validFrom: "", validUntil: "", isActive: true,
};

function toForm(p: Promotion): FormData {
  return {
    code: p.code,
    description: p.description || "",
    discountType: p.discountType,
    discountValue: String(p.discountValue),
    minBookingValue: p.minBookingValue != null ? String(p.minBookingValue) : "",
    maxUses: p.maxUses != null ? String(p.maxUses) : "",
    validFrom: p.validFrom ? p.validFrom.split("T")[0] : "",
    validUntil: p.validUntil ? p.validUntil.split("T")[0] : "",
    isActive: p.isActive,
  };
}

function PromotionModal({ mode, initial, onClose, onSave, saving }: {
  mode: "create" | "edit";
  initial?: Promotion | null;
  onClose: () => void;
  onSave: (data: FormData) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial ? toForm(initial) : EMPTY);
  const set = (k: keyof FormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  function randomCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    return "ATHOO" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "Create Promotion" : "Edit Promotion"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Promo Code *</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                value={form.code} onChange={e => set("code", e.target.value.toUpperCase())}
                placeholder="e.g. ATHOO50"
                disabled={mode === "edit"}
              />
              {mode === "create" && (
                <button onClick={() => set("code", randomCode())} className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors">
                  Random
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Description</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="E.g. First booking 20% off"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Discount Type</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.discountType}
                onChange={e => set("discountType", e.target.value)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (Rs.)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                Discount Value {form.discountType === "percentage" ? "(%)" : "(Rs.)"} *
              </label>
              <input
                type="number" min="1" max={form.discountType === "percentage" ? "100" : undefined}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.discountValue} onChange={e => set("discountValue", e.target.value)}
                placeholder={form.discountType === "percentage" ? "20" : "500"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Min Booking Value (Rs.)</label>
              <input
                type="number" min="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.minBookingValue} onChange={e => set("minBookingValue", e.target.value)}
                placeholder="e.g. 1000"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Max Uses (blank = unlimited)</label>
              <input
                type="number" min="1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.maxUses} onChange={e => set("maxUses", e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Valid From</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.validFrom} onChange={e => set("validFrom", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Valid Until</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.validUntil} onChange={e => set("validUntil", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Active Status</p>
              <p className="text-xs text-slate-500">Customers can use this code when active</p>
            </div>
            <button onClick={() => set("isActive", !form.isActive)} className="text-blue-600">
              {form.isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-slate-400" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.code.trim() || !form.discountValue}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {mode === "create" ? "Create Promotion" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromotionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; promo?: Promotion } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["promotions"],
    queryFn: () => api<{ promotions: Promotion[] }>("/api/admin/promotions"),
  });

  const createMut = useMutation({
    mutationFn: (d: FormData) => api("/api/admin/promotions", { method: "POST", body: JSON.stringify({ ...d, discountValue: Number(d.discountValue), minBookingValue: d.minBookingValue ? Number(d.minBookingValue) : undefined, maxUses: d.maxUses ? Number(d.maxUses) : undefined }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promotions"] }); setModal(null); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: FormData }) =>
      api(`/api/admin/promotions/${id}`, { method: "PATCH", body: JSON.stringify({ ...d, discountValue: Number(d.discountValue), minBookingValue: d.minBookingValue ? Number(d.minBookingValue) : undefined, maxUses: d.maxUses ? Number(d.maxUses) : undefined }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promotions"] }); setModal(null); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/promotions/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/api/admin/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function handleSave(d: FormData) {
    if (modal?.mode === "create") createMut.mutate(d);
    else if (modal?.promo) updateMut.mutate({ id: modal.promo.id, d });
  }

  const promos = data?.promotions || [];
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Promotions & Promo Codes</h2>
          <p className="text-sm text-slate-500 mt-0.5">Create and manage discount codes for customers</p>
        </div>
        <button
          onClick={() => { setError(""); setModal({ mode: "create" }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} /> New Promotion
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading promotions…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {promos.map(promo => {
            const usagePercent = promo.maxUses ? Math.min(100, (promo.usedCount / promo.maxUses) * 100) : null;
            const isExpired = promo.validUntil && new Date(promo.validUntil) < new Date();
            const isFull = promo.maxUses != null && promo.usedCount >= promo.maxUses;

            return (
              <div key={promo.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${!promo.isActive || isExpired || isFull ? "border-slate-200 opacity-70" : "border-slate-200"}`}>
                <div className={`px-5 py-4 ${promo.isActive && !isExpired && !isFull ? "bg-gradient-to-br from-blue-50 to-indigo-50" : "bg-slate-50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Tag size={16} className="text-blue-600" />
                      <button
                        onClick={() => copyCode(promo.code)}
                        className="font-bold text-lg text-slate-900 font-mono hover:text-blue-600 transition-colors flex items-center gap-1.5"
                        title="Copy code"
                      >
                        {promo.code}
                        {copied === promo.code ? <Check size={14} className="text-green-500" /> : <Copy size={13} className="text-slate-400" />}
                      </button>
                    </div>
                    <button onClick={() => toggleMut.mutate({ id: promo.id, isActive: !promo.isActive })}>
                      {promo.isActive ? <ToggleRight size={24} className="text-blue-600" /> : <ToggleLeft size={24} className="text-slate-400" />}
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">{promo.description || "—"}</p>
                </div>

                <div className="px-5 py-3 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Discount</span>
                    <span className="font-semibold text-slate-900">
                      {promo.discountType === "percentage" ? `${promo.discountValue}%` : `Rs. ${promo.discountValue}`} off
                    </span>
                  </div>
                  {promo.minBookingValue && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Min value</span>
                      <span className="text-slate-700">Rs. {promo.minBookingValue}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Uses</span>
                    <span className="text-slate-700">
                      {promo.usedCount} {promo.maxUses ? `/ ${promo.maxUses}` : "(unlimited)"}
                    </span>
                  </div>
                  {usagePercent !== null && (
                    <div className="bg-slate-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${usagePercent}%` }} />
                    </div>
                  )}
                  {(promo.validFrom || promo.validUntil) && (
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      {promo.validFrom && <span>From {new Date(promo.validFrom).toLocaleDateString()}</span>}
                      {promo.validUntil && <span className={isExpired ? "text-red-400" : ""}>Until {new Date(promo.validUntil).toLocaleDateString()}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-1 pt-1">
                    {(isExpired || isFull) && (
                      <span className="flex-1 text-xs text-red-500 font-medium">
                        {isExpired ? "Expired" : "Limit reached"}
                      </span>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => { setError(""); setModal({ mode: "edit", promo }); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      {confirmDeleteId === promo.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={() => { deleteMut.mutate(promo.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(promo.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {promos.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400">
              <Tag size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-500">No promotions yet</p>
              <p className="text-sm mt-1">Create your first promo code to start attracting customers</p>
            </div>
          )}
        </div>
      )}

      {modal && (
        <PromotionModal
          mode={modal.mode}
          initial={modal.promo}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}

