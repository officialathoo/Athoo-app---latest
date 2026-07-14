import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";
import type { Broadcast, User } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Megaphone, Plus, Loader2, ChevronDown, ChevronUp, Users, Send } from "lucide-react";

const TEMPLATES = [
  { label: "Welcome", title: "Welcome to Athoo!", message: "Thank you for joining Athoo — Pakistan's premier home services marketplace. Book trusted service providers near you anytime." },
  { label: "Reminder", title: "Booking Reminder", message: "You have a scheduled appointment coming up. Please make sure you're available. You can manage your bookings in the app." },
  { label: "Promotion", title: "Special Offer", message: "Don't miss our latest promotion! Book any service today and get exclusive savings. Limited time offer." },
  { label: "Maintenance", title: "Scheduled Maintenance", message: "We will be performing scheduled maintenance on [DATE] from [TIME]. Services will be temporarily unavailable during this window." },
  { label: "Commission Due", title: "Commission Payment Reminder", message: "Your pending commission balance has reached the limit. Please make a payment to continue receiving new job requests." },
  { label: "Verify ID", title: "Complete Your Verification", message: "Your account verification is pending. Upload your ID documents in the app to start receiving bookings from customers." },
];

export function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", audience: "all", targetUserIds: "" });
  const [formError, setFormError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ broadcasts: Broadcast[] }>("/api/admin/broadcasts");
      setBroadcasts(res.broadcasts || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!showForm) return;
    let active = true;
    api<{ users: User[] }>("/api/admin/users", {
      params: userSearch.trim() ? { search: userSearch.trim() } : undefined,
    })
      .then((res) => { if (active) setUsers(res.users || []); })
      .catch(() => { if (active) setUsers([]); });
    return () => { active = false; };
  }, [showForm, userSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setFormError("Title and message are required.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const payload = {
        title: form.title,
        message: form.message,
        audience: form.targetUserIds.trim() ? "specific" : form.audience,
        targetUserIds: form.targetUserIds.split(",").map((v) => v.trim()).filter(Boolean),
      };
      await api("/api/admin/broadcasts", { method: "POST", body: JSON.stringify(payload) });
      setForm({ title: "", message: "", audience: "all", targetUserIds: "" });
      setUserSearch("");
      setShowTemplates(false);
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUserIds = form.targetUserIds.split(",").map((v) => v.trim()).filter(Boolean);
  function toggleTargetUser(userId: string) {
    const next = selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId];
    setForm((f) => ({ ...f, targetUserIds: next.join(",") }));
  }

  const audienceLabel = form.targetUserIds.trim()
    ? `${selectedUserIds.length} specific user${selectedUserIds.length !== 1 ? "s" : ""}`
    : form.audience === "customers" ? "Customers only"
    : form.audience === "providers" ? "Providers only"
    : "Everyone";

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Broadcast
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          <span className="text-sm">Loading broadcasts...</span>
        </div>
      )}

      {!loading && broadcasts.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-sm">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Megaphone size={28} className="text-blue-500" />
          </div>
          <p className="text-base font-semibold text-slate-700 mb-1">No broadcasts yet</p>
          <p className="text-sm text-slate-400 mb-4">Send announcements to all users, customers, or providers.</p>
          <button onClick={() => setShowForm(true)} className="text-sm text-blue-600 hover:text-blue-800 font-semibold">
            Create your first broadcast →
          </button>
        </div>
      )}

      <div className="space-y-3">
        {broadcasts.map((b) => {
          const audienceColors: Record<string, string> = {
            all: "bg-slate-100 text-slate-600",
            customers: "bg-sky-100 text-sky-700",
            providers: "bg-orange-100 text-orange-700",
            specific: "bg-purple-100 text-purple-700",
          };
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <Megaphone size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-800">{b.title}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${audienceColors[b.audience] || audienceColors.all}`}>
                        <Users size={10} className="inline mr-1" />{b.audience}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-2">{b.message}</p>
                    <p className="text-xs text-slate-400 mt-2">{formatDate(b.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-semibold text-slate-800">New Broadcast</h3>
                <p className="text-xs text-slate-400 mt-0.5">Sending to: <span className="font-medium text-slate-600">{audienceLabel}</span></p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Templates */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 mb-2"
                >
                  {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Quick templates
                </button>
                {showTemplates && (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, title: t.title, message: t.message })); setShowTemplates(false); }}
                        className="text-xs bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-medium px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-200 transition-colors text-left"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Broadcast title"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Message</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Write your broadcast message here..."
                  required
                />
                <p className="text-xs text-slate-400 mt-1">{form.message.length} / 500 chars</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Audience</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "all", label: "Everyone", desc: "All users" },
                    { value: "customers", label: "Customers", desc: "Customers only" },
                    { value: "providers", label: "Providers", desc: "Providers only" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, audience: opt.value, targetUserIds: "" }))}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${form.audience === opt.value && !form.targetUserIds.trim() ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <p className="text-xs font-semibold text-slate-700">{opt.label}</p>
                      <p className="text-[11px] text-slate-400">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Specific Users <span className="text-slate-400 normal-case font-normal">(optional — overrides audience)</span>
                </label>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search by name, email, or phone"
                />
                {selectedUserIds.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <Users size={13} className="text-blue-600 shrink-0" />
                    <span className="text-xs font-semibold text-blue-700">{selectedUserIds.length} user{selectedUserIds.length !== 1 ? "s" : ""} selected</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, targetUserIds: "" }))} className="ml-auto text-xs text-blue-500 hover:text-blue-700">Clear</button>
                  </div>
                )}
                <div className="max-h-44 overflow-auto rounded-xl border border-slate-200 bg-slate-50">
                  {users.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-500 text-center">No matching users</div>
                  ) : (
                    users.slice(0, 20).map((u) => {
                      const checked = selectedUserIds.includes(u.id);
                      return (
                        <button key={u.id} type="button" onClick={() => toggleTargetUser(u.id)}
                          className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 border-slate-200 transition-colors ${checked ? "bg-blue-50" : "hover:bg-white"}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-800 truncate">{u.name || "Unnamed"}</div>
                              <div className="text-xs text-slate-500 truncate">{u.phone}{u.email ? ` · ${u.email}` : ""}</div>
                            </div>
                            <div className={`text-xs font-semibold px-2 py-1 rounded-full ${checked ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                              {checked ? "✓" : u.role}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">{formError}</div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {submitting ? "Sending..." : "Send Broadcast"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
