import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, RefreshCw, Edit2, X, AlertTriangle, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { api, formatDate } from "@/lib/api";
import type { User } from "@/lib/types";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { BulkActionBar } from "@/components/admin/BulkActionBar";

type SortKey = "name" | "joinedAt" | "totalJobs";
type ActionKind = "deactivate" | "reactivate" | "logout";

export function UsersPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("users.write");
  const focusId = new URLSearchParams(window.location.search).get("focus") || "";
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortKey>("joinedAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;
  const [selected, setSelected] = useState<User | null>(null);
  const [focusOpened, setFocusOpened] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", location: "", bio: "" });
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status, sort, direction });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await api<{ customers: User[]; total: number }>(`/api/admin/customers?${params.toString()}`);
      setCustomers(res.customers || []);
      setTotal(Number(res.total || 0));
    } catch (error) {
      toast({ title: "Could not load customers", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, status, sort, direction, debouncedSearch, from, to]);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [status, sort, direction, debouncedSearch, from, to]);
  useEffect(() => {
    if (!focusId || focusOpened) return;
    setFocusOpened(true);
    api<{ user: User }>(`/api/admin/users/${focusId}`)
      .then(({ user }) => {
        if (user.role !== "customer") return;
        openCustomer(user);
      })
      .catch((error) => toast({ title: "Could not open customer", description: (error as Error).message, variant: "destructive" }));
  }, [focusId, focusOpened]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const range = useMemo(() => ({ from: total ? (page - 1) * limit + 1 : 0, to: Math.min(page * limit, total) }), [page, total]);

  function openCustomer(customer: User) {
    setSelected(customer);
    setEditForm({ name: customer.name || "", location: customer.location || "", bio: customer.bio || "" });
    setNotes(customer.adminNotes || "");
    setEditMode(false);
    setReason("");
    setPendingAction(null);
  }

  async function runAccountAction() {
    if (!selected || !pendingAction) return;
    if (reason.trim().length < 5) {
      toast({ title: "Reason required", description: "Enter at least 5 characters.", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      const endpoint = pendingAction === "logout"
        ? `/api/admin/customers/${selected.id}/revoke-sessions`
        : `/api/admin/customers/${selected.id}/${pendingAction}`;
      await api(endpoint, { method: pendingAction === "logout" ? "POST" : "PATCH", body: { reason: reason.trim() } });
      toast({ title: pendingAction === "logout" ? "Customer signed out" : `Customer ${pendingAction}d` });
      setPendingAction(null);
      setReason("");
      await load();
      if (pendingAction !== "logout") setSelected(null);
    } catch (error) {
      toast({ title: "Action failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function saveProfile() {
    if (!selected || editForm.name.trim().length < 2 || reason.trim().length < 5) {
      toast({ title: "Name and reason required", description: "Use a valid name and an operational reason.", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await api(`/api/admin/customers/${selected.id}/profile`, {
        method: "PATCH",
        body: { name: editForm.name.trim(), location: editForm.location.trim() || null, bio: editForm.bio.trim() || null, reason: reason.trim() },
      });
      toast({ title: "Customer profile corrected" });
      setEditMode(false);
      setReason("");
      await load();
    } catch (error) {
      toast({ title: "Profile update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function runBulkAction(action: ActionKind) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const actionLabel = action === "logout" ? "force logout" : action;
    const reason = window.prompt(`Reason to ${actionLabel} ${ids.length} selected customer${ids.length === 1 ? "" : "s"}:`)?.trim() || "";
    if (reason.length < 5) {
      toast({ title: "Reason required", description: "Enter at least 5 characters.", variant: "destructive" });
      return;
    }
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api(
        action === "logout" ? `/api/admin/customers/${id}/revoke-sessions` : `/api/admin/customers/${id}/${action}`,
        { method: action === "logout" ? "POST" : "PATCH", body: { reason } },
      )));
      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded) {
        toast({ title: `${succeeded} customer${succeeded === 1 ? "" : "s"} updated`, description: failed ? `${failed} action${failed === 1 ? "" : "s"} failed and can be retried.` : reason });
      }
      if (failed && !succeeded) toast({ title: "Bulk action failed", description: "No selected customer could be updated.", variant: "destructive" });
      setSelectedIds(new Set());
      await load();
    } finally {
      setBulkLoading(false);
    }
  }

  async function saveNotes() {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${selected.id}/notes`, { method: "PATCH", body: { notes } });
      toast({ title: "Notes saved" });
      await load();
    } catch (error) {
      toast({ title: "Could not save notes", description: (error as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search by Athoo ID, name, phone, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All customers</option><option value="active">Active</option><option value="deactivated">Deactivated</option>
          </select>
          <input aria-label="Customers joined from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
          <input aria-label="Customers joined to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
          <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="joinedAt">Joined date</option><option value="name">Name</option><option value="totalJobs">Bookings</option>
          </select>
          <button onClick={() => setDirection((d) => d === "asc" ? "desc" : "asc")} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">{direction === "asc" ? "Ascending" : "Descending"}</button>
          <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Refresh customers"><RefreshCw size={16} /></button>
        </div>

        {canWrite ? <div className="border-b border-slate-100 px-5 py-3 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" aria-label="Select all customers on this page" checked={customers.length > 0 && customers.every((customer) => selectedIds.has(customer.id))} onChange={() => setSelectedIds(customers.length > 0 && customers.every((customer) => selectedIds.has(customer.id)) ? new Set() : new Set(customers.map((customer) => customer.id)))} />
            Select all customers on this page
          </label>
          <BulkActionBar count={selectedIds.size} busy={bulkLoading} onClear={() => setSelectedIds(new Set())} actions={[
            { label: "Deactivate", tone: "danger", onClick: () => runBulkAction("deactivate") },
            { label: "Reactivate", onClick: () => runBulkAction("reactivate") },
            { label: "Force logout", tone: "neutral", onClick: () => runBulkAction("logout") },
          ]} />
        </div> : null}

        <DataTable data={customers} loading={loading} keyExtractor={(u) => u.id} emptyMessage="No customers found." columns={[
          ...(canWrite ? [{ header: "Select", width: "w-16", render: (u: User) => <input type="checkbox" aria-label={`Select ${u.name}`} checked={selectedIds.has(u.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(u.id) ? next.delete(u.id) : next.add(u.id); return next; })} /> }] : []),
          { header: "Customer", render: (u) => <div><p className="font-medium text-slate-800">{u.name}</p><p className="font-mono text-[11px] font-semibold text-slate-500">{u.publicId || "ID pending"}</p><p className="text-xs text-slate-400">{u.phone} · {u.email || "No email"}</p></div> },
          { header: "Status", render: (u) => <StatusBadge status={u.isDeactivated ? "deactivated" : "active"} /> },
          { header: "Bookings", key: "totalJobs" },
          { header: "Joined", render: (u) => <span className="text-xs text-slate-500">{formatDate(u.joinedAt)}</span> },
          { header: "", render: (u) => <div className="flex gap-3"><Link to={`/users/${u.id}/activity`} className="text-xs text-purple-600 font-medium">Activity</Link><button onClick={() => openCustomer(u)} className="text-xs text-blue-600 font-medium">View</button></div> },
        ]} />

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {range.from}–{range.to} of {total} customers</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded border disabled:opacity-40"><ChevronLeft size={14} /></button>
            <span>Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded border disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between"><div><h3 className="font-semibold text-slate-900">{selected.name}</h3><p className="font-mono text-xs font-semibold text-slate-600">{selected.publicId || "Athoo ID pending"}</p><p className="text-xs text-slate-400">{selected.phone} · {selected.email || "No email"}</p></div><button onClick={() => setSelected(null)}><X size={18} /></button></div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Status</p><p className="font-medium">{selected.isDeactivated ? "Deactivated" : "Active"}</p></div>
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Bookings</p><p className="font-medium">{selected.totalJobs}</p></div>
                <div className="bg-slate-50 rounded-lg p-3 col-span-2"><p className="text-xs text-slate-500">Location</p><p className="font-medium">{selected.location || "—"}</p></div>
              </div>

              {canWrite && (
                <>
                  <button onClick={() => setEditMode((v) => !v)} className="flex items-center gap-2 text-sm text-blue-700"><Edit2 size={14} /> {editMode ? "Cancel profile correction" : "Correct profile details"}</button>
                  {editMode && <div className="space-y-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <input className="w-full px-3 py-2 border rounded-lg" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                    <input className="w-full px-3 py-2 border rounded-lg" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} placeholder="Location" />
                    <textarea className="w-full px-3 py-2 border rounded-lg" rows={3} value={editForm.bio} onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))} placeholder="Biography" />
                    <input className="w-full px-3 py-2 border rounded-lg" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Operational reason (required)" />
                    <p className="text-xs text-slate-500">Phone and email changes must use customer verification flows and cannot be edited here.</p>
                    <button onClick={saveProfile} disabled={actionLoading} className="w-full py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">Save correction</button>
                  </div>}
                </>
              )}

              {canWrite && <div><label className="text-xs font-semibold text-slate-600">Internal notes</label><textarea className="w-full mt-1 px-3 py-2 border rounded-lg" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /><button onClick={saveNotes} className="mt-2 px-3 py-1.5 text-xs bg-slate-100 rounded-lg">Save notes</button></div>}

              {canWrite && <div className="pt-4 border-t space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setPendingAction(selected.isDeactivated ? "reactivate" : "deactivate"); setReason(""); }} className="px-3 py-2 text-xs rounded-lg bg-amber-50 text-amber-800">{selected.isDeactivated ? "Reactivate customer" : "Deactivate customer"}</button>
                  <button onClick={() => { setPendingAction("logout"); setReason(""); }} className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700 flex items-center gap-1"><LogOut size={13} /> Force logout</button>
                </div>
                {pendingAction && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex gap-2"><AlertTriangle size={18} className="text-amber-600" /><p className="text-sm font-medium text-slate-800">Confirm {pendingAction === "logout" ? "force logout" : pendingAction}</p></div>
                  <textarea className="w-full px-3 py-2 border rounded-lg bg-white" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mandatory operational reason" />
                  <div className="flex justify-end gap-2"><button onClick={() => setPendingAction(null)} className="px-3 py-2 text-sm border rounded-lg">Cancel</button><button onClick={runAccountAction} disabled={actionLoading} className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50">Confirm</button></div>
                </div>}
              </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
