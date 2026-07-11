import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Phone, Plus, Trash2, Pencil, Loader2, Save } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type EmergencyContact = {
  id: string;
  name: string;
  number: string;
  description?: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

const SEED_CONTACTS = [
  { name: "Rescue 1122", number: "1122", description: "Emergency Rescue Service", icon: "shield" },
  { name: "Edhi Foundation", number: "115", description: "Welfare & Ambulance", icon: "heart" },
  { name: "Police Emergency", number: "15", description: "Pakistan Police", icon: "shield-check" },
  { name: "Rescue Ambulance", number: "1122", description: "Ambulance Service", icon: "activity" },
  { name: "Child Protection", number: "1099", description: "Child helpline", icon: "users" },
];

export function EmergencyContactsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", number: "", description: "", icon: "phone-call", sortOrder: "0", isActive: true });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["emergency-contacts-admin"],
    queryFn: () => api<{ contacts: EmergencyContact[] }>("/api/admin/emergency-contacts"),
    staleTime: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      api("/api/admin/emergency-contacts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Contact added" });
      qc.invalidateQueries({ queryKey: ["emergency-contacts-admin"] });
      setShowAdd(false);
      setForm({ name: "", number: "", description: "", icon: "phone-call", sortOrder: "0", isActive: true });
    },
    onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Record<string, any>) =>
      api(`/api/admin/emergency-contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Contact updated" });
      qc.invalidateQueries({ queryKey: ["emergency-contacts-admin"] });
      setEditing(null);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/emergency-contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Contact deleted" });
      qc.invalidateQueries({ queryKey: ["emergency-contacts-admin"] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      Promise.all(SEED_CONTACTS.map((c, i) =>
        api("/api/admin/emergency-contacts", { method: "POST", body: JSON.stringify({ ...c, sortOrder: i }) })
      )),
    onSuccess: () => {
      toast({ title: "Default contacts seeded" });
      qc.invalidateQueries({ queryKey: ["emergency-contacts-admin"] });
    },
    onError: () => toast({ title: "Seed failed", variant: "destructive" }),
  });

  const contacts = data?.contacts ?? [];

  function ContactForm({ onSubmit, onCancel, loading }: { onSubmit: (f: any) => void; onCancel: () => void; loading: boolean }) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Rescue 1122" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number *</label>
            <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 1122" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Short description" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Icon (Lucide name)</label>
            <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="phone-call" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sort Order</label>
            <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="ec-active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
          <label htmlFor="ec-active" className="text-sm text-slate-700">Active (visible in app)</label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={() => onSubmit(form)} disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5">
            <Save size={14} /> {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Emergency Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage emergency numbers shown in the mobile app</p>
        </div>
        <div className="flex gap-2">
          {contacts.length === 0 && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Seed Defaults
            </button>
          )}
          <button
            onClick={() => { setShowAdd(!showAdd); setEditing(null); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </div>

      {showAdd && (
        <ContactForm
          onSubmit={f => createMutation.mutate(f)}
          onCancel={() => setShowAdd(false)}
          loading={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading…
        </div>
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Phone size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No emergency contacts yet</p>
          <p className="text-slate-400 text-sm mt-1">Add contacts or click "Seed Defaults" to add Pakistan emergency numbers</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => (
            <div key={c.id}>
              {editing?.id === c.id ? (
                <ContactForm
                  onSubmit={f => updateMutation.mutate({ id: c.id, ...f })}
                  onCancel={() => setEditing(null)}
                  loading={updateMutation.isPending}
                />
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <Phone size={18} className="text-red-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800">{c.name}</p>
                        {!c.isActive && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{c.number}{c.description && ` — ${c.description}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditing(c); setForm({ name: c.name, number: c.number, description: c.description || "", icon: c.icon, sortOrder: String(c.sortOrder), isActive: c.isActive }); setShowAdd(false); }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmDeleteId === c.id ? (
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => { deleteMutation.mutate(c.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(c.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
