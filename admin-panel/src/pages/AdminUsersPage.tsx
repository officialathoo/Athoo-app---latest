import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, UserPlus, Pencil, Trash2, X, Check, ChevronDown,
  Crown, Headphones, DollarSign, Settings2, Loader2, Megaphone
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  adminRole?: string | null;
  adminPermissions?: string[];
  isDeactivated: boolean;
  joinedAt: string;
}

const ALL_PERMISSIONS = [
  { key: "dashboard.read", label: "View Dashboard", group: "Operations" },
  { key: "users.read", label: "View Users", group: "Users" },
  { key: "users.write", label: "Edit or Restrict Users", group: "Users" },
  { key: "verification.read", label: "View Provider Verification", group: "Providers" },
  { key: "verification.write", label: "Manage Providers and Verification", group: "Providers" },
  { key: "bookings.read", label: "View Bookings and Requests", group: "Operations" },
  { key: "bookings.write", label: "Manage Bookings and Requests", group: "Operations" },
  { key: "finance.read", label: "View Finance", group: "Finance" },
  { key: "finance.write", label: "Manage Finance", group: "Finance" },
  { key: "reports.read", label: "View Reports and Analytics", group: "Analytics" },
  { key: "export.read", label: "Export Data", group: "Analytics" },
  { key: "audit.read", label: "View Audit Log", group: "Analytics" },
  { key: "complaints.read", label: "View Support Tickets", group: "Support" },
  { key: "complaints.write", label: "Manage Support Tickets", group: "Support" },
  { key: "notifications.read", label: "View Admin Notifications", group: "Support" },
  { key: "notifications.write", label: "Send Notifications", group: "Support" },
  { key: "promotions.read", label: "View Promotions", group: "Marketing" },
  { key: "promotions.write", label: "Manage Promotions", group: "Marketing" },
  { key: "broadcasts.read", label: "View Broadcasts", group: "Marketing" },
  { key: "broadcasts.write", label: "Send Broadcasts", group: "Marketing" },
  { key: "marketing.read", label: "View Marketing Content", group: "Marketing" },
  { key: "marketing.write", label: "Manage Marketing Content", group: "Marketing" },
  { key: "settings.read", label: "View Platform Settings", group: "Admin" },
  { key: "settings.write", label: "Edit Platform Settings", group: "Admin" },
];

const ROLE_PRESETS: Record<string, string[]> = {
  super_admin: ALL_PERMISSIONS.map((permission) => permission.key),
  ops: [
    "dashboard.read", "notifications.read", "users.read", "users.write",
    "verification.read", "verification.write", "bookings.read", "bookings.write",
    "complaints.read", "complaints.write", "broadcasts.read", "reports.read", "audit.read",
  ],
  finance: ["dashboard.read", "notifications.read", "users.read", "bookings.read", "finance.read", "finance.write", "reports.read", "export.read", "audit.read", "settings.read"],
  support: ["dashboard.read", "notifications.read", "users.read", "bookings.read", "complaints.read", "complaints.write", "broadcasts.read"],
  marketing: ["dashboard.read", "notifications.read", "notifications.write", "marketing.read", "marketing.write", "broadcasts.read", "broadcasts.write", "promotions.read", "promotions.write", "reports.read"],
  technical: ["dashboard.read", "notifications.read", "users.read", "bookings.read", "audit.read", "reports.read", "settings.read", "settings.write", "export.read"],
};

const ROLE_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  super_admin: { label: "Super Admin", color: "bg-purple-100 text-purple-800 border-purple-200", icon: <Crown size={12} /> },
  ops: { label: "Operations", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <Settings2 size={12} /> },
  finance: { label: "Finance", color: "bg-green-100 text-green-800 border-green-200", icon: <DollarSign size={12} /> },
  support: { label: "Support", color: "bg-orange-100 text-orange-800 border-orange-200", icon: <Headphones size={12} /> },
  marketing: { label: "Marketing", color: "bg-pink-100 text-pink-800 border-pink-200", icon: <Megaphone size={12} /> },
  technical: { label: "Technical", color: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: <Shield size={12} /> },
};

function RoleBadge({ adminRole }: { adminRole?: string | null }) {
  if (!adminRole) return <span className="text-xs text-slate-400">Admin (no role)</span>;
  const info = ROLE_LABELS[adminRole];
  if (!info) return <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5">{adminRole}</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 font-medium ${info.color}`}>
      {info.icon} {info.label}
    </span>
  );
}

interface AdminUserFormData {
  name: string;
  phone: string;
  email: string;
  password: string;
  adminRole: string;
  adminPermissions: string[];
}

const EMPTY_FORM: AdminUserFormData = { name: "", phone: "", email: "", password: "", adminRole: "", adminPermissions: [] };

function AdminUserModal({
  mode,
  initial,
  onClose,
  onSave,
  saving,
}: {
  mode: "create" | "edit";
  initial?: AdminUser | null;
  onClose: () => void;
  onSave: (data: AdminUserFormData) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AdminUserFormData>({
    name: initial?.name || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    password: "",
    adminRole: initial?.adminRole || "",
    adminPermissions: initial?.adminPermissions || [],
  });

  function setRole(role: string) {
    setForm(f => ({ ...f, adminRole: role, adminPermissions: ROLE_PRESETS[role] || [] }));
  }

  function togglePerm(key: string) {
    setForm(f => ({
      ...f,
      adminPermissions: f.adminPermissions.includes(key)
        ? f.adminPermissions.filter(p => p !== key)
        : [...f.adminPermissions, key],
    }));
  }

  const groups = [...new Set(ALL_PERMISSIONS.map(p => p.group))];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "Create Admin User" : "Edit Admin User"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Full Name *</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Admin name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Phone *</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+92 300 0000000"
                disabled={mode === "edit"}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Email</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="admin@athoo.pk"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">
                {mode === "create" ? "Password *" : "New Password (leave blank to keep)"}
              </label>
              <input
                type="password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder={mode === "edit" ? "Leave blank to keep current" : "Secure password"}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-2 block">Role Preset</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(ROLE_LABELS).map(([key, { label, color, icon }]) => (
                <button
                  key={key}
                  onClick={() => setRole(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    form.adminRole === key ? color + " ring-2 ring-offset-1 ring-blue-400" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
              <button
                onClick={() => setForm(f => ({ ...f, adminRole: "", adminPermissions: [] }))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Custom
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-2 block">Permissions</label>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {groups.map((group, gi) => (
                <div key={group} className={gi > 0 ? "border-t border-slate-100" : ""}>
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">{group}</div>
                  <div className="grid grid-cols-2 gap-0">
                    {ALL_PERMISSIONS.filter(p => p.group === group).map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.adminPermissions.includes(perm.key)}
                          onChange={() => togglePerm(perm.key)}
                          className="w-4 h-4 rounded text-blue-600 border-slate-300"
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim() || !form.phone.trim() || (mode === "create" && !form.password.trim())}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {mode === "create" ? "Create Admin" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; user?: AdminUser } | null>(null);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<{ admins: AdminUser[] }>("/api/admin/admin-users"),
  });

  const createMut = useMutation({
    mutationFn: (d: AdminUserFormData) =>
      api("/api/admin/admin-users", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setModal(null); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const editMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: AdminUserFormData }) =>
      api(`/api/admin/admin-users/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setModal(null); setError(""); },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/admin-users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: Error) => setError(e.message),
  });

  const admins = data?.admins || [];
  const filteredAdmins = search.trim()
    ? admins.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.phone.includes(search) ||
        (a.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (a.adminRole || "").toLowerCase().includes(search.toLowerCase())
      )
    : admins;

  function handleSave(d: AdminUserFormData) {
    if (modal?.mode === "create") createMut.mutate(d);
    else if (modal?.user) editMut.mutate({ id: modal.user.id, d });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Admin Users</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage admin accounts, roles, and permissions</p>
        </div>
        <button
          onClick={() => { setError(""); setModal({ mode: "create" }); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <UserPlus size={16} /> Add Admin
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email or role..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-start gap-2">
          <X size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading admin users...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Permissions</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Joined</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdmins.map(admin => (
                <tr key={admin.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {admin.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{admin.name}</p>
                        <p className="text-xs text-slate-500">{admin.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleBadge adminRole={admin.adminRole} />
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(admin.adminPermissions || []).slice(0, 3).map(p => (
                        <span key={p} className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{p}</span>
                      ))}
                      {(admin.adminPermissions || []).length > 3 && (
                        <span className="text-xs text-slate-400">+{(admin.adminPermissions || []).length - 3} more</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500 hidden md:table-cell text-sm">
                    {new Date(admin.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => { setError(""); setModal({ mode: "edit", user: admin }); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      {confirmDeleteId === admin.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={() => { deleteMut.mutate(admin.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Deactivate</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(admin.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Deactivate">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAdmins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    <Shield size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">{search ? "No matching admin users" : "No admin users yet"}</p>
                    <p className="text-xs mt-1">{search ? "Try a different search term" : "Create the first admin user above"}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <AdminUserModal
          mode={modal.mode}
          initial={modal.user}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={createMut.isPending || editMut.isPending}
        />
      )}
    </div>
  );
}

