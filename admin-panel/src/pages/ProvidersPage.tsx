import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { api, currency, formatDate, openAuthenticatedFile } from "@/lib/api";
import type { User } from "@/lib/types";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { CheckCircle, ExternalLink, FileText, RefreshCw, Search, X, XCircle } from "lucide-react";

interface ProviderDoc {
  id: string;
  type: string;
  label?: string | null;
  url: string;
  status: "pending" | "approved" | "rejected";
  rejectionNote?: string | null;
  createdAt: string;
}

function askReason(message: string): string | null {
  const value = window.prompt(message)?.trim() || "";
  return value.length >= 3 ? value : null;
}

export function ProvidersPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("users.write");
  const canReadVerification = hasPermission("verification.read");
  const canWriteVerification = hasPermission("verification.write");
  const canManageFinance = hasPermission("finance.write");
  const focusId = new URLSearchParams(window.location.search).get("focus") || "";

  const [providers, setProviders] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<User | null>(null);
  const [focusOpened, setFocusOpened] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [commissionLimit, setCommissionLimit] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", location: "", bio: "" });
  const [docs, setDocs] = useState<ProviderDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [availabilityPolicy, setAvailabilityPolicy] = useState<any>(null);
  const [policyRadius, setPolicyRadius] = useState("15");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ providers: User[]; total: number }>("/api/admin/providers", {
        params: { search: search.trim() || undefined, status: filter, from: from || undefined, to: to || undefined, limit: 200 },
      });
      setProviders(res.providers || []);
      setTotal(Number(res.total || 0));
    } catch (error) {
      setLoadError((error as Error).message || "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [filter, from, search, to]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => { setSelectedIds(new Set()); }, [filter, from, search, to]);
  useEffect(() => {
    if (!focusId || focusOpened) return;
    setFocusOpened(true);
    api<{ user: User }>(`/api/admin/users/${focusId}`)
      .then(({ user }) => {
        if (user.role !== "provider") return;
        void openProvider(user);
      })
      .catch((error) => toast({ title: "Could not open provider", description: (error as Error).message, variant: "destructive" }));
  }, [focusId, focusOpened]);

  const selectedFromList = useMemo(
    () => selectedProvider ? providers.find((provider) => provider.id === selectedProvider.id) || selectedProvider : null,
    [providers, selectedProvider],
  );

  async function runBulkAccountAction(action: "deactivate" | "reactivate" | "revoke-sessions") {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const label = action === "revoke-sessions" ? "force logout" : action;
    const reason = window.prompt(`Reason to ${label} ${ids.length} selected provider${ids.length === 1 ? "" : "s"}:`)?.trim() || "";
    if (reason.length < 3) {
      toast({ title: "Reason required", description: "Enter at least 3 characters.", variant: "destructive" });
      return;
    }
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/admin/users/${id}/${action}`, { method: action === "revoke-sessions" ? "POST" : "PATCH", body: { reason } })));
      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded) toast({ title: `${succeeded} provider${succeeded === 1 ? "" : "s"} updated`, description: failed ? `${failed} action${failed === 1 ? "" : "s"} failed and can be retried.` : reason });
      if (failed && !succeeded) toast({ title: "Bulk action failed", description: "No selected provider could be updated.", variant: "destructive" });
      setSelectedIds(new Set());
      await load();
    } finally {
      setBulkLoading(false);
    }
  }

  async function openProvider(provider: User) {
    setSelectedProvider(provider);
    setCommissionLimit(String(provider.commissionLimit || 5000));
    setEditMode(false);
    setEditForm({ name: provider.name || "", location: provider.location || "", bio: provider.bio || "" });
    setDocs([]);
    setAvailabilityPolicy(null);
    setPolicyRadius(String(provider.maxTravelDistanceKm || 15));
    setDocsLoading(true);
    const tasks: Promise<unknown>[] = [
      api<any>(`/api/admin/users/${provider.id}/availability-policy`)
        .then((response) => {
          setAvailabilityPolicy(response);
          setPolicyRadius(String(response.maxTravelDistanceKm || 15));
        })
        .catch(() => setAvailabilityPolicy(null)),
    ];
    if (canReadVerification) {
      tasks.push(
        api<{ documents: ProviderDoc[] }>(`/api/admin/users/${provider.id}/documents`)
          .then((response) => setDocs(response.documents || []))
          .catch(() => setDocs([])),
      );
    }
    await Promise.all(tasks);
    setDocsLoading(false);
  }

  async function refreshSelected() {
    await load();
    if (!selectedProvider) return;
    const response = await api<{ user: User }>(`/api/admin/users/${selectedProvider.id}`);
    setSelectedProvider(response.user);
  }

  async function handleReviewDoc(doc: ProviderDoc, status: "approved" | "rejected") {
    const rejectionNote = status === "rejected" ? askReason(`Reason for rejecting ${doc.label || doc.type}:`) : null;
    if (status === "rejected" && !rejectionNote) return;
    setActionLoading(true);
    try {
      await api(`/api/admin/documents/${doc.id}`, {
        method: "PATCH",
        body: { status, rejectionNote },
      });
      if (selectedProvider) await openProvider(selectedProvider);
      toast({ title: status === "approved" ? "Document approved" : "Document rejected" });
    } catch (error) {
      toast({ title: "Document review failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function updateAccountState(action: "block" | "unblock" | "deactivate" | "reactivate") {
    if (!selectedProvider) return;
    const reason = askReason(`Reason to ${action} ${selectedProvider.name}:`);
    if (!reason) return;
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${selectedProvider.id}/${action}`, { method: "PATCH", body: { reason } });
      await refreshSelected();
      toast({ title: `Provider ${action}d`, description: reason });
    } catch (error) {
      toast({ title: "Account action failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function revokeSessions() {
    if (!selectedProvider) return;
    const reason = askReason(`Reason for signing ${selectedProvider.name} out of every device:`);
    if (!reason) return;
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${selectedProvider.id}/revoke-sessions`, { method: "POST", body: { reason } });
      toast({ title: "Provider sessions revoked", description: reason });
    } catch (error) {
      toast({ title: "Session revocation failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAvailabilityOverride(isAvailable: boolean) {
    if (!selectedProvider) return;
    const reason = askReason(`Reason for turning ${selectedProvider.name} ${isAvailable ? "online" : "offline"}:`);
    if (!reason) return;
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${selectedProvider.id}/availability`, { method: "PATCH", body: { isAvailable, reason } });
      await refreshSelected();
      toast({ title: isAvailable ? "Provider set online" : "Provider forced offline", description: reason });
    } catch (error) {
      toast({ title: "Availability update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAvailabilityPolicyUpdate() {
    if (!selectedProvider || !availabilityPolicy) return;
    const reason = askReason(`Reason for updating ${selectedProvider.name}'s availability policy:`);
    if (!reason) return;
    setActionLoading(true);
    try {
      const result = await api<any>(`/api/admin/users/${selectedProvider.id}/availability-policy`, {
        method: "PATCH",
        body: { maxTravelDistanceKm: Number(policyRadius), schedule: availabilityPolicy.schedule, reason },
      });
      setAvailabilityPolicy(result);
      await refreshSelected();
      toast({ title: "Availability policy updated", description: reason });
    } catch (error) {
      toast({ title: "Policy update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateCommissionLimit() {
    if (!selectedProvider) return;
    const limit = Number(commissionLimit);
    if (!Number.isFinite(limit) || limit < 100) {
      toast({ title: "Invalid limit", description: "Enter a valid limit of at least Rs 100.", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await api(`/api/admin/providers/${selectedProvider.id}/commission-limit`, { method: "PATCH", body: { commissionLimit: limit } });
      await refreshSelected();
      toast({ title: "Commission limit updated", description: currency(limit) });
    } catch (error) {
      toast({ title: "Commission limit update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!selectedProvider) return;
    const reason = askReason(`Reason for changing ${selectedProvider.name}'s profile:`);
    if (!reason) return;
    setActionLoading(true);
    try {
      const response = await api<{ user: User }>(`/api/admin/users/${selectedProvider.id}/profile`, {
        method: "PATCH",
        body: { ...editForm, reason },
      });
      setSelectedProvider(response.user);
      setEditMode(false);
      await load();
      toast({ title: "Provider profile updated", description: reason });
    } catch (error) {
      toast({ title: "Profile update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  const provider = selectedFromList;

  return (
    <div className="space-y-5" data-testid="provider-management-page">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by Athoo ID, provider, phone, email, or CNIC..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All providers</option>
            <option value="blocked">Blocked</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="available">Online</option>
            <option value="offline">Offline</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <input aria-label="Providers joined from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
          <input aria-label="Providers joined to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" />
          <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Refresh providers">
            <RefreshCw size={16} />
          </button>
        </div>

        {loadError && <div className="px-5 py-3 text-sm text-red-700 bg-red-50">{loadError}</div>}
        {canManage ? <div className="border-b border-slate-100 px-5 py-3 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" aria-label="Select all providers in this result" checked={providers.length > 0 && providers.every((provider) => selectedIds.has(provider.id))} onChange={() => setSelectedIds(providers.length > 0 && providers.every((provider) => selectedIds.has(provider.id)) ? new Set() : new Set(providers.map((provider) => provider.id)))} />
            Select all loaded providers
          </label>
          <BulkActionBar count={selectedIds.size} busy={bulkLoading} onClear={() => setSelectedIds(new Set())} actions={[
            { label: "Deactivate", tone: "danger", onClick: () => runBulkAccountAction("deactivate") },
            { label: "Reactivate", onClick: () => runBulkAccountAction("reactivate") },
            { label: "Force logout", tone: "neutral", onClick: () => runBulkAccountAction("revoke-sessions") },
          ]} />
        </div> : null}
        <DataTable
          data={providers}
          loading={loading}
          keyExtractor={(item) => item.id}
          emptyMessage="No providers found."
          columns={[
            ...(canManage ? [{ header: "Select", width: "w-16", render: (item: User) => <input type="checkbox" aria-label={`Select ${item.name}`} checked={selectedIds.has(item.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} /> }] : []),
            { header: "Provider", render: (item) => <div><p className="font-medium text-slate-800">{item.name}</p><p className="font-mono text-[11px] font-semibold text-slate-500">{item.publicId || "ID pending"}</p><p className="text-xs text-slate-400">{item.phone}</p></div> },
            { header: "Status", render: (item) => <div className="flex flex-col gap-1">{item.isVerified ? <StatusBadge status="verified" /> : <StatusBadge status="unverified" />}{item.isBlocked && <StatusBadge status="blocked" />}<span className="text-xs text-slate-500">{item.isDeactivated ? "Deactivated" : item.isAvailable ? "Online" : "Offline"}</span></div> },
            { header: "Rating", render: (item) => <span className="text-sm">{item.ratingCount ? `${item.rating}/5 (${item.ratingCount})` : "—"}</span> },
            { header: "Jobs", key: "totalJobs" },
            { header: "Pending Due", render: (item) => <span className={item.pendingCommission > 0 ? "text-amber-700 font-medium text-xs" : "text-xs text-slate-400"}>{currency(item.pendingCommission)}</span> },
            { header: "", render: (item) => <button className="text-xs text-blue-600 font-medium" onClick={() => openProvider(item)}>Manage</button> },
          ]}
        />
        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">Showing {providers.length} of {total} matching providers</div>
      </div>

      {provider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-slate-800">{provider.name}</h3>{provider.isVerified ? <StatusBadge status="verified" /> : <StatusBadge status="unverified" />}</div>
                <p className="font-mono text-xs font-semibold text-slate-600">{provider.publicId || "Athoo ID pending"}</p>
                <p className="text-xs text-slate-400">{provider.phone} · {provider.verificationStatus || "pending"}</p>
              </div>
              <button onClick={() => setSelectedProvider(null)} className="text-slate-400" aria-label="Close provider details"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                {[
                  ["Account", provider.isDeactivated ? "Deactivated" : provider.isBlocked ? "Blocked" : "Active"],
                  ["Availability", provider.isAvailable ? "Online" : "Offline"],
                  ["Verification", provider.verificationStatus || "pending"],
                  ["Rating", provider.ratingCount ? `${provider.rating}/5 (${provider.ratingCount})` : "No ratings"],
                  ["Jobs", provider.totalJobs],
                  ["Rate/hr", provider.ratePerHour ? currency(provider.ratePerHour) : "—"],
                  ["Service radius", `${provider.maxTravelDistanceKm || 15} km`],
                  ["Pending commission", currency(provider.pendingCommission)],
                  ["Joined", formatDate(provider.joinedAt)],
                ].map(([label, value]) => <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="font-medium text-slate-800 truncate">{String(value)}</p></div>)}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigate(`/users/${provider.id}/activity`)} className="px-3 py-2 text-xs rounded-lg bg-slate-100 text-slate-700">View Activity</button>
                {canWriteVerification && <button onClick={() => navigate("/verification")} className="px-3 py-2 text-xs rounded-lg bg-indigo-50 text-indigo-700">Open Verification Queue</button>}
                {canWriteVerification && <button onClick={() => navigate("/requests")} className="px-3 py-2 text-xs rounded-lg bg-violet-50 text-violet-700">Service Requests</button>}
                {canWriteVerification && <button onClick={() => navigate("/rate-requests")} className="px-3 py-2 text-xs rounded-lg bg-purple-50 text-purple-700">Rate Requests</button>}
              </div>

              {canManage && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Safe profile fields</h4><button onClick={() => setEditMode((value) => !value)} className="text-xs text-blue-600">{editMode ? "Cancel" : "Edit"}</button></div>
                  {editMode ? (
                    <div className="space-y-2">
                      <input value={editForm.name} onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Provider name" />
                      <input value={editForm.location} onChange={(event) => setEditForm((form) => ({ ...form, location: event.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Location" />
                      <textarea value={editForm.bio} onChange={(event) => setEditForm((form) => ({ ...form, bio: event.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} placeholder="Provider bio" />
                      <p className="text-xs text-slate-500">Identity, approved services, hourly rate, verification, availability, and finance settings use their dedicated audited workflows.</p>
                      <button onClick={handleSaveProfile} disabled={actionLoading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">Save profile</button>
                    </div>
                  ) : <p className="text-sm text-slate-600">{provider.bio || "No provider biography supplied."}</p>}
                </div>
              )}

              {canReadVerification && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 mb-3"><FileText size={14} /><h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Verification Documents</h4>{docsLoading && <span className="text-xs text-slate-400">Loading…</span>}</div>
                  {!docsLoading && docs.length === 0 && <p className="text-xs text-slate-400">No documents uploaded.</p>}
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                      <div className="flex-1"><p className="text-xs font-semibold capitalize">{doc.label || doc.type.replace(/_/g, " ")}</p><p className="text-xs text-slate-500">{doc.status}{doc.rejectionNote ? ` · ${doc.rejectionNote}` : ""}</p></div>
                      <button onClick={() => openAuthenticatedFile(doc.url)} className="text-blue-600" aria-label={`Open ${doc.label || doc.type}`}><ExternalLink size={14} /></button>
                      {canWriteVerification && doc.status !== "approved" && <button onClick={() => handleReviewDoc(doc, "approved")} disabled={actionLoading} className="text-green-700"><CheckCircle size={15} /></button>}
                      {canWriteVerification && doc.status !== "rejected" && <button onClick={() => handleReviewDoc(doc, "rejected")} disabled={actionLoading} className="text-red-700"><XCircle size={15} /></button>}
                    </div>
                  ))}
                </div>
              )}

              {canManage && (
                <div className="border-t border-slate-100 pt-4 space-y-3" data-testid="provider-operational-controls">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Operational Controls</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div data-testid="provider-availability-policy"><label className="text-xs text-slate-500">Service radius (km)</label><div className="flex gap-2 mt-1"><input type="number" min="1" max="100" value={policyRadius} onChange={(event) => setPolicyRadius(event.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm" /><button onClick={handleAvailabilityPolicyUpdate} disabled={!availabilityPolicy || actionLoading} className="px-3 py-2 bg-cyan-600 text-white rounded-lg text-xs">Save Policy</button></div></div>
                    {canManageFinance && <div><label className="text-xs text-slate-500">Commission limit</label><div className="flex gap-2 mt-1"><input type="number" min="100" value={commissionLimit} onChange={(event) => setCommissionLimit(event.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm" /><button onClick={handleUpdateCommissionLimit} disabled={actionLoading} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs">Save Policy</button></div></div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleAvailabilityOverride(!provider.isAvailable)} disabled={actionLoading} data-testid={provider.isAvailable ? "provider-force-offline" : "provider-force-online"} className="px-3 py-2 text-xs bg-slate-100 rounded-lg">{provider.isAvailable ? "Force Offline" : "Set Online"}</button>
                    <button onClick={revokeSessions} disabled={actionLoading} className="px-3 py-2 text-xs bg-amber-50 text-amber-700 rounded-lg">Force Logout</button>
                    <button onClick={() => updateAccountState(provider.isBlocked ? "unblock" : "block")} disabled={actionLoading} className="px-3 py-2 text-xs bg-red-50 text-red-700 rounded-lg">{provider.isBlocked ? "Unblock" : "Block"}</button>
                    <button onClick={() => updateAccountState(provider.isDeactivated ? "reactivate" : "deactivate")} disabled={actionLoading} className="px-3 py-2 text-xs bg-slate-800 text-white rounded-lg">{provider.isDeactivated ? "Reactivate" : "Deactivate"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
