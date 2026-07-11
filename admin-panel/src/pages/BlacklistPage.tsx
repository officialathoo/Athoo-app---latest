import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { AdminBlacklist } from "@/lib/types";
import {
  Ban, Plus, Trash2, ToggleLeft, ToggleRight, Loader2,
  AlertCircle, Phone, Mail, ShieldAlert, X, CheckCircle,
} from "lucide-react";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function BlacklistPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AdminBlacklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; value: string } | null>(null);

  const [addForm, setAddForm] = useState({ type: "phone", value: "", reason: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ entries: AdminBlacklist[] }>("/api/admin/blacklist");
      setEntries(res.entries || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.value.trim()) { setAddError("Value is required."); return; }
    setAddLoading(true); setAddError("");
    try {
      await api("/api/admin/blacklist", {
        method: "POST",
        body: JSON.stringify({ type: addForm.type, value: addForm.value.trim(), reason: addForm.reason.trim() || undefined }),
      });
      setAddForm({ type: "phone", value: "", reason: "" });
      setShowAdd(false);
      await load();
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAddLoading(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      await api(`/api/admin/blacklist/${id}/toggle`, { method: "PATCH" });
      await load();
      toast({ title: "Blacklist entry updated" });
    } catch (e) {
      toast({ title: "Failed to toggle", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function handleDelete(id: string, value: string) {
    setPendingDelete({ id, value });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await api(`/api/admin/blacklist/${id}`, { method: "DELETE" });
      await load();
      toast({ title: "Removed from blacklist" });
    } catch (e) {
      toast({ title: "Failed to delete", description: (e as Error).message, variant: "destructive" });
    }
  }

  const active = entries.filter(e => e.isActive);
  const inactive = entries.filter(e => !e.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Ban size={20} className="text-red-500" /> Blacklist
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Block phone numbers or email addresses from registering new accounts.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setAddError(""); }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors shadow-sm"
        >
          <Plus size={15} /> Add to Blacklist
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Entries", value: entries.length, color: "text-slate-700" },
          { label: "Active", value: active.length, color: "text-red-600" },
          { label: "Disabled", value: inactive.length, color: "text-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add form modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <form onSubmit={handleAdd}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Add to Blacklist</h3>
                <button type="button" onClick={() => setShowAdd(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Type</label>
                  <div className="flex gap-3">
                    {(["phone", "email"] as const).map(t => (
                      <label key={t} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                        addForm.type === t ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}>
                        <input
                          type="radio"
                          name="type"
                          value={t}
                          checked={addForm.type === t}
                          onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                          className="sr-only"
                        />
                        {t === "phone" ? <Phone size={14} /> : <Mail size={14} />}
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    {addForm.type === "phone" ? "Phone Number" : "Email Address"}
                  </label>
                  <input
                    type={addForm.type === "email" ? "email" : "tel"}
                    value={addForm.value}
                    onChange={e => setAddForm(f => ({ ...f, value: e.target.value }))}
                    placeholder={addForm.type === "phone" ? "+92 300 0000000" : "user@example.com"}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Reason (optional)</label>
                  <textarea
                    value={addForm.reason}
                    onChange={e => setAddForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="e.g. Fraudulent account, spam, abuse..."
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  />
                </div>
                {addError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                    <AlertCircle size={14} /> {addError}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-colors"
                >
                  {addLoading ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                  {addLoading ? "Adding..." : "Add to Blacklist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          <span className="text-sm">Loading blacklist...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <ShieldAlert size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No blacklisted entries</p>
          <p className="text-xs text-slate-400 mt-1">Add phone numbers or emails to block them from registering.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Value</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Added By</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(entry => (
                <tr key={entry.id} className={`hover:bg-slate-50 ${!entry.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                      entry.type === "phone"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {entry.type === "phone" ? <Phone size={11} /> : <Mail size={11} />}
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-sm font-medium text-slate-900">{entry.value}</td>
                  <td className="px-5 py-3.5 text-slate-500 max-w-xs truncate">{entry.reason || <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-slate-500">{entry.addedByName || <span className="text-slate-300">—</span>}</td>
                  <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    {entry.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                        <Ban size={11} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        <CheckCircle size={11} /> Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleToggle(entry.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        title={entry.isActive ? "Disable" : "Enable"}
                      >
                        {entry.isActive ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id, entry.value)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <p className="text-base font-semibold text-slate-900">Remove from blacklist?</p>
            <p className="mt-1 text-sm text-slate-600">
              Are you sure you want to remove <span className="font-mono font-semibold">{pendingDelete.value}</span> from the blacklist? They will be allowed to register again.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
