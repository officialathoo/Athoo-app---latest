import { useState } from "react";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HelpCircle, Plus, Pencil, Trash2, X, Check, Loader2,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Users, UserCog, Globe, GripVertical,
} from "lucide-react";

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  targetAudience: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface FormData {
  question: string;
  answer: string;
  category: string;
  targetAudience: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: FormData = {
  question: "", answer: "", category: "general",
  targetAudience: "all", sortOrder: "0", isActive: true,
};

const CATEGORIES = [
  { value: "general", label: "General", color: "bg-slate-100 text-slate-700" },
  { value: "booking", label: "Booking", color: "bg-blue-100 text-blue-700" },
  { value: "payment", label: "Payment", color: "bg-green-100 text-green-700" },
  { value: "technical", label: "Technical", color: "bg-purple-100 text-purple-700" },
  { value: "safety", label: "Safety", color: "bg-red-100 text-red-700" },
  { value: "provider", label: "Provider", color: "bg-orange-100 text-orange-700" },
];

const AUDIENCE_OPTS = [
  { value: "all", label: "Everyone", icon: <Globe size={13} /> },
  { value: "customer", label: "Customers Only", icon: <Users size={13} /> },
  { value: "provider", label: "Providers Only", icon: <UserCog size={13} /> },
];

function catInfo(cat: string) {
  return CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];
}

function FaqModal({ mode, initial, onClose, onSave, saving }: {
  mode: "create" | "edit"; initial?: Faq | null;
  onClose: () => void; onSave: (d: FormData) => void; saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(
    initial ? {
      question: initial.question, answer: initial.answer,
      category: initial.category, targetAudience: initial.targetAudience,
      sortOrder: String(initial.sortOrder), isActive: initial.isActive,
    } : EMPTY
  );
  const set = (k: keyof FormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "Add FAQ" : "Edit FAQ"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Question *</label>
            <input value={form.question} onChange={e => set("question", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. How do I cancel a booking?" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Answer *</label>
            <textarea value={form.answer} onChange={e => set("answer", e.target.value)} rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Write a clear, helpful answer..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Target</label>
              <select value={form.targetAudience} onChange={e => set("targetAudience", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {AUDIENCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={e => set("sortOrder", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0" />
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
          <button onClick={() => onSave(form)} disabled={saving || !form.question.trim() || !form.answer.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {mode === "create" ? "Add FAQ" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FaqsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: Faq } | null>(null);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const faqsQ = useQuery({
    queryKey: ["admin-faqs"],
    queryFn: () => api<{ faqs: Faq[] }>("/api/admin/marketing/faqs"),
  });

  const createFaq = useMutation({
    mutationFn: (d: FormData) => api("/api/admin/marketing/faqs", {
      method: "POST",
      body: JSON.stringify({ ...d, sortOrder: Number(d.sortOrder) }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-faqs"] }); setModal(null); },
  });

  const updateFaq = useMutation({
    mutationFn: ({ id, d }: { id: string; d: FormData }) => api(`/api/admin/marketing/faqs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...d, sortOrder: Number(d.sortOrder) }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-faqs"] }); setModal(null); },
  });

  const deleteFaq = useMutation({
    mutationFn: (id: string) => api(`/api/admin/marketing/faqs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-faqs"] }),
  });

  const toggleFaq = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/marketing/faqs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-faqs"] }),
  });

  const allFaqs = faqsQ.data?.faqs ?? [];
  const filtered = filter === "all" ? allFaqs : allFaqs.filter(f => f.category === filter);

  const categoryCounts = CATEGORIES.reduce<Record<string, number>>((acc, c) => {
    acc[c.value] = allFaqs.filter(f => f.category === c.value).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Help & FAQs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {allFaqs.length} questions — displayed in the mobile app help screen
          </p>
        </div>
        <button onClick={() => setModal({ mode: "create" })}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
          <Plus size={16} /> Add FAQ
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <button
          onClick={() => setFilter("all")}
          className={`bg-white border rounded-xl p-3 text-center transition-all ${filter === "all" ? "border-blue-500 ring-2 ring-blue-200" : "hover:border-blue-300"}`}
        >
          <p className="text-xl font-bold text-slate-800">{allFaqs.length}</p>
          <p className="text-xs text-slate-500">All</p>
        </button>
        {CATEGORIES.map(c => (
          <button key={c.value}
            onClick={() => setFilter(c.value)}
            className={`bg-white border rounded-xl p-3 text-center transition-all ${filter === c.value ? "border-blue-500 ring-2 ring-blue-200" : "hover:border-blue-300"}`}
          >
            <p className="text-xl font-bold text-slate-800">{categoryCounts[c.value] || 0}</p>
            <p className="text-xs text-slate-500">{c.label}</p>
          </button>
        ))}
      </div>

      {/* FAQ List */}
      {faqsQ.isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border rounded-2xl">
          <HelpCircle size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No FAQs yet</p>
          <p className="text-slate-400 text-sm">Add your first frequently asked question</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(faq => {
            const cat = catInfo(faq.category);
            const isOpen = expanded === faq.id;
            return (
              <div key={faq.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md ${!faq.isActive ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => setExpanded(isOpen ? null : faq.id)}
                      className="w-full text-left flex items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
                          {faq.targetAudience !== "all" && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                              {faq.targetAudience === "customer" ? "Customers" : "Providers"}
                            </span>
                          )}
                          {!faq.isActive && (
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Hidden</span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-800 text-sm">{faq.question}</p>
                      </div>
                      {isOpen ? <ChevronUp size={16} className="text-slate-400 mt-1 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 mt-1 shrink-0" />}
                    </button>
                    {isOpen && (
                      <p className="text-sm text-slate-600 mt-3 pt-3 border-t leading-relaxed">{faq.answer}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleFaq.mutate({ id: faq.id, isActive: !faq.isActive })}
                      className={`p-1.5 rounded-lg ${faq.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}>
                      {faq.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => setModal({ mode: "edit", item: faq })}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deleteFaq.mutate(faq.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <FaqModal
          mode={modal.mode}
          initial={modal.item}
          onClose={() => setModal(null)}
          onSave={d => modal.mode === "create"
            ? createFaq.mutate(d)
            : updateFaq.mutate({ id: modal.item!.id, d })
          }
          saving={createFaq.isPending || updateFaq.isPending}
        />
      )}
    </div>
  );
}
