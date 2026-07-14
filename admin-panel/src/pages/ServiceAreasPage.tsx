import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2, Plus, Pencil, Trash2, X, MapPin, ToggleLeft, ToggleRight } from "lucide-react";
import { BulkActionBar } from "@/components/admin/BulkActionBar";

type ServiceArea = {
  id: string;
  name: string;
  province: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

// Canonical Pakistan provinces/territories — must match PAKISTAN_PROVINCES in
// api-server/src/routes/service-areas.ts exactly, since the backend rejects
// any other spelling. Kept as a fixed dropdown (not free text) so city data
// can never drift into inconsistent spellings (e.g. "ICT" vs "Islamabad
// Capital Territory").
const PAKISTAN_PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Azad Jammu & Kashmir",
  "Gilgit-Baltistan",
];

export function ServiceAreasPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("settings.write");
  const [editing, setEditing] = useState<ServiceArea | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "service-areas"],
    queryFn: () => api<{ areas: ServiceArea[] }>("/api/admin/service-areas"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<ServiceArea> & { id?: string }) => {
      const { id, ...body } = payload;
      return id
        ? api(`/api/admin/service-areas/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/api/admin/service-areas`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "service-areas"] });
      setShowForm(false);
      setEditing(null);
      toast({ title: "Saved", description: "Service area saved successfully" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/service-areas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "service-areas"] });
      setConfirmDeleteId(null);
      toast({ title: "Deactivated", description: "Service area hidden from users" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/service-areas/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "service-areas"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });


  const bulkMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => api(`/api/admin/service-areas/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) })));
      return ids.length;
    },
    onSuccess: (count, isActive) => {
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "service-areas"] });
      toast({ title: isActive ? "Activated" : "Deactivated", description: `${count} service areas updated` });
    },
    onError: (e: any) => toast({ title: "Bulk action failed", description: e.message, variant: "destructive" }),
  });

  const areas = data?.areas ?? [];
  const allSelected = areas.length > 0 && areas.every((area) => selectedIds.has(area.id));
  const toggleSelection = (id: string) => setSelectedIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(area: ServiceArea) {
    setEditing(area);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload: any = {
      name: String(fd.get("name") || "").trim(),
      province: String(fd.get("province") || "").trim() || null,
      isActive: fd.get("isActive") === "true",
      sortOrder: parseInt(String(fd.get("sortOrder") || "0"), 10),
    };
    if (editing) payload.id = editing.id;
    saveMutation.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MapPin size={22} className="text-blue-600" />
            Service Areas (Cities)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Control which cities appear in the mobile app search. Toggle a city off to hide it from customers.
          </p>
        </div>
        {canWrite && <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
        >
          <Plus size={16} /> Add City
        </button>}
      </div>

      {canWrite ? (
        <BulkActionBar
          count={selectedIds.size}
          busy={bulkMutation.isPending}
          onClear={() => setSelectedIds(new Set())}
          actions={[
            { label: "Activate", onClick: () => bulkMutation.mutate(true) },
            { label: "Deactivate", tone: "danger", onClick: () => bulkMutation.mutate(false) },
          ]}
        />
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 font-semibold mb-2">Failed to load service areas</p>
          <button onClick={() => refetch()} className="text-sm text-blue-600 underline">Retry</button>
        </div>
      ) : areas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No service areas yet</p>
          <p className="text-sm mt-1">Manage active cities and service areas across Pakistan.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-12 px-4 py-3"><input aria-label="Select all service areas" type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(areas.map((area) => area.id)))} /></th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">City</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Province</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Sort Order</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-4 py-3"><input aria-label={`Select ${area.name}`} type="checkbox" checked={selectedIds.has(area.id)} onChange={() => toggleSelection(area.id)} /></td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{area.name}</td>
                  <td className="px-4 py-3 text-slate-500">{area.province || "—"}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{area.sortOrder}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={!canWrite}
                      onClick={() => canWrite && toggleMutation.mutate({ id: area.id, isActive: !area.isActive })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                        area.isActive
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {area.isActive ? (
                        <><ToggleRight size={14} /> Active</>
                      ) : (
                        <><ToggleLeft size={14} /> Inactive</>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canWrite && <button
                        onClick={() => openEdit(area)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      >
                        <Pencil size={15} />
                      </button>}
                      {canWrite && <button
                        onClick={() => setConfirmDeleteId(area.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 size={15} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 bg-slate-50 text-xs text-slate-400 border-t border-slate-200">
            {areas.length} {areas.length === 1 ? "city" : "cities"} · {areas.filter((a) => a.isActive).length} active
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {canWrite && showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{editing ? "Edit City" : "Add City"}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">City Name *</label>
                <input
                  name="name"
                  required
                  defaultValue={editing?.name || ""}
                  placeholder="e.g. Islamabad"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Province</label>
                <select
                  name="province"
                  defaultValue={editing?.province || ""}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {PAKISTAN_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Sort Order</label>
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={editing?.sortOrder ?? 0}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    name="isActive"
                    defaultValue={editing?.isActive !== false ? "true" : "false"}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="true">Active (visible in app)</option>
                    <option value="false">Inactive (hidden)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditing(null); }}
                  className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  {editing ? "Save Changes" : "Add City"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {canWrite && confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Deactivate City?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will hide the city from new customer and provider selections. Historical records remain intact.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
