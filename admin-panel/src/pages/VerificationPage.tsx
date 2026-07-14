import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { ProviderDocument, User } from "@/lib/types";
import { StorageImage } from "@/components/ui/StorageImage";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ShieldCheck,
  ShieldX,
  Clock,
  RefreshCw,
  User as UserIcon,
  Star,
  Briefcase,
  MapPin,
  X,
  Eye,
  FileText,
  Hourglass,
  AlertTriangle,
  Phone,
  CreditCard,
} from "lucide-react";

type Tab = "pending" | "in_process" | "approved" | "rejected";

// Human-readable labels for every document type the mobile app uploads.
const DOC_TYPE_LABELS: Record<string, string> = {
  cnic_front: "CNIC Front",
  cnic_back: "CNIC Back",
  selfie: "Live Selfie (with CNIC)",
  police: "Police Verification Letter",
  diploma: "Diploma / Certificate",
  video: "Introduction Video",
  license: "License",
  other: "Other Document",
};

// Required doc types that MUST be present before an admin can approve.
const REQUIRED_DOC_TYPES = ["cnic_front", "cnic_back", "selfie", "police"];

const TAB_LABEL: Record<Tab, string> = {
  pending: "Pending",
  in_process: "In Process",
  approved: "Approved",
  rejected: "Rejected",
};

function getStatus(p: User): Tab {
  const s = p.verificationStatus;
  if (s === "approved" || s === "rejected" || s === "in_process") return s;
  if (p.isVerified) return "approved";
  return "pending";
}

export function VerificationPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("verification.write");
  const [providers, setProviders] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [docs, setDocs] = useState<ProviderDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [imageModal, setImageModal] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rejectionDialog, setRejectionDialog] = useState<{
    target: User;
    note: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ users: User[] }>("/api/admin/users", {
        params: { role: "provider" },
      });
      setProviders((res.users || []).filter((u) => !u.isDeactivated));
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs(userId: string) {
    setDocsLoading(true);
    try {
      const res = await api<{ documents: ProviderDocument[] }>(
        `/api/admin/users/${userId}/documents`
      );
      setDocs(res.documents || []);
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selected) loadDocs(selected.id);
    else setDocs([]);
  }, [selected]);

  async function setStatus(user: User, status: Tab, note?: string) {
    // Gate: if approving, verify all required documents are present (including police letter).
    if (status === "approved") {
      const missingRequired = REQUIRED_DOC_TYPES.filter((type) => !docs.some((document) => document.type === type && document.status === "approved"));
      if (missingRequired.length > 0) {
        const labels = missingRequired.map((t) => DOC_TYPE_LABELS[t] || t).join(", ");
        toast({
          title: "Cannot approve — missing documents",
          description: `Required documents are missing or not approved: ${labels}. Review each document before approving the provider.`,
          variant: "destructive",
        });
        return;
      }
    }
    setActionLoading(user.id);
    try {
      await api(`/api/admin/users/${user.id}/verification-status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note || "" }),
      });
      await load();
      setSelected(null);
      setRejectionDialog(null);
      toast({ title: "Verification status updated" });
    } catch (e) {
      toast({ title: "Failed to update status", description: (e as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  async function runBulkStatus(status: "in_process" | "rejected") {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const note = status === "rejected"
      ? (window.prompt(`Rejection reason for ${ids.length} selected provider${ids.length === 1 ? "" : "s"}:`)?.trim() || "")
      : "Verification review started by admin";
    if (status === "rejected" && note.length < 3) {
      toast({ title: "Rejection reason required", description: "Enter a clear reason before rejecting providers.", variant: "destructive" });
      return;
    }
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => api(`/api/admin/users/${id}/verification-status`, {
        method: "PATCH",
        body: { status, note },
      })));
      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (succeeded) toast({ title: `${succeeded} verification record${succeeded === 1 ? "" : "s"} updated`, description: failed ? `${failed} record${failed === 1 ? "" : "s"} could not be updated.` : undefined });
      if (failed && !succeeded) toast({ title: "Bulk verification failed", description: "No selected provider could be updated.", variant: "destructive" });
      setSelectedIds(new Set());
      await load();
    } finally {
      setBulkLoading(false);
    }
  }

  const grouped: Record<Tab, User[]> = {
    pending: [],
    in_process: [],
    approved: [],
    rejected: [],
  };
  providers.forEach((p) => grouped[getStatus(p)].push(p));
  const displayList = grouped[tab];

  const columns = [
    ...(canWrite ? [{
      header: "Select",
      width: "w-16",
      render: (provider: User) => (
        <input
          type="checkbox"
          aria-label={`Select ${provider.name}`}
          checked={selectedIds.has(provider.id)}
          onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(provider.id) ? next.delete(provider.id) : next.add(provider.id); return next; })}
        />
      ),
    }] : []),
    {
      header: "Provider",
      render: (p: User) => (
        <div className="flex items-center gap-3">
          {p.profileImage ? (
            <button onClick={() => setImageModal(p.profileImage!)} className="shrink-0">
              <StorageImage
                objectPath={p.profileImage}
                alt={p.name}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-200 hover:ring-blue-400 transition-all"
              />
            </button>
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ background: p.profileColor || "#1A6EE0" }}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-800">{p.name}</p>
            <p className="text-xs text-slate-400">{p.phone}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Services",
      render: (p: User) => (
        <p className="text-xs text-slate-600 max-w-xs truncate">
          {(p.services || []).join(", ") || "—"}
        </p>
      ),
    },
    {
      header: "Location",
      render: (p: User) => (
        <span className="text-xs text-slate-500">{p.location || "—"}</span>
      ),
    },
    {
      header: "Rating",
      render: (p: User) => (
        <div className="flex items-center gap-1">
          <Star size={12} className="text-amber-400 fill-amber-400" />
          <span className="text-xs text-slate-600">
            {p.rating || 0} ({p.ratingCount || 0})
          </span>
        </div>
      ),
    },
    {
      header: "Joined",
      render: (p: User) => (
        <span className="text-xs text-slate-500">{formatDate(p.joinedAt)}</span>
      ),
    },
    {
      header: "",
      render: (p: User) => (
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-2 py-1 rounded-lg transition-colors"
            onClick={() => setSelected(p)}
          >
            <Eye size={13} />
            Review
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Provider Verification
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Review documents and approve, mark in process, or reject providers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setSelectedIds(new Set()); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab === t
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {TAB_LABEL[t]} ({grouped[t].length})
                </button>
              ))}
            </div>
            <button
              onClick={load}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {loadError && (
          <div className="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-200 flex items-center justify-between">
            <span>Failed to load providers: {loadError}</span>
            <button onClick={load} className="underline text-red-700 hover:text-red-900 ml-3">Retry</button>
          </div>
        )}
        {canWrite ? <div className="border-b border-slate-100 px-5 py-3 space-y-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              aria-label={`Select all ${TAB_LABEL[tab].toLowerCase()} providers`}
              checked={displayList.length > 0 && displayList.every((provider) => selectedIds.has(provider.id))}
              onChange={() => setSelectedIds(displayList.length > 0 && displayList.every((provider) => selectedIds.has(provider.id)) ? new Set() : new Set(displayList.map((provider) => provider.id)))}
            />
            Select all providers in this queue
          </label>
          <BulkActionBar
            count={selectedIds.size}
            busy={bulkLoading}
            onClear={() => setSelectedIds(new Set())}
            actions={[
              { label: "Mark in process", onClick: () => runBulkStatus("in_process") },
              { label: "Reject selected", tone: "danger", onClick: () => runBulkStatus("rejected") },
            ]}
          />
        </div> : null}
        <DataTable
          data={displayList}
          loading={loadError ? false : loading}
          keyExtractor={(p) => p.id}
          emptyMessage={`No providers in ${TAB_LABEL[tab].toLowerCase()}.`}
          columns={columns}
        />
      </div>

      {/* Provider Review Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {selected.profileImage ? (
                  <button
                    onClick={() => setImageModal(selected.profileImage!)}
                    className="shrink-0"
                  >
                    <StorageImage
                      objectPath={selected.profileImage}
                      alt={selected.name}
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-slate-200 hover:ring-blue-400 cursor-zoom-in"
                    />
                  </button>
                ) : (
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                    style={{ background: selected.profileColor || "#1A6EE0" }}
                  >
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-semibold text-slate-800">
                    {selected.name}
                  </h3>
                  <p className="text-xs text-slate-400">{selected.phone}</p>
                  <div className="mt-1">
                    <StatusBadge status={getStatus(selected)} />
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Phone", selected.phone],
                  ["CNIC", (selected as any).cnicNumber || "—"],
                  ["Father's Name", (selected as any).fatherName || "—"],
                  ["Services", (selected.services || []).join(", ") || "—"],
                  ["Location", selected.location || "—"],
                  ["Experience", selected.experience || "—"],
                  ["Rate/hr", selected.ratePerHour ? `Rs. ${selected.ratePerHour}` : "—"],
                  ["Rating", `${selected.rating || 0}/5 (${selected.ratingCount || 0})`],
                  ["Total Jobs", selected.totalJobs || 0],
                  ["Joined", formatDate(selected.joinedAt)],
                  ["Availability", selected.isAvailable ? "Available" : "Unavailable"],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      {label === "Services" && <Briefcase size={10} />}
                      {label === "Location" && <MapPin size={10} />}
                      {label === "Rating" && <Star size={10} />}
                      {label === "Phone" && <Phone size={10} />}
                      {label === "CNIC" && <CreditCard size={10} />}
                      {label}
                    </p>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">
                      {String(val)}
                    </p>
                  </div>
                ))}
              </div>

              {selected.bio && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <UserIcon size={10} /> Bio / About
                  </p>
                  <p className="text-sm text-slate-700">{selected.bio}</p>
                </div>
              )}

              {selected.verificationNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-600 font-medium mb-1">
                    Last verification note
                  </p>
                  <p className="text-sm text-amber-800">
                    {selected.verificationNote}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <FileText size={12} /> Submitted Documents
                </p>

                {/* Missing required documents warning */}
                {(() => {
                  const uploadedTypes = docs.map((d) => d.type);
                  const missing = REQUIRED_DOC_TYPES.filter((t) => !uploadedTypes.includes(t));
                  if (missing.length === 0) return null;
                  return (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-red-700">Missing required documents</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          {missing.map((t) => DOC_TYPE_LABELS[t] || t).join(", ")}
                        </p>
                        <p className="text-xs text-red-500 mt-0.5">Approval is blocked until all required documents are uploaded.</p>
                      </div>
                    </div>
                  );
                })()}

                {docsLoading ? (
                  <p className="text-xs text-slate-400">Loading documents...</p>
                ) : docs.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-3">
                    No documents uploaded yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {docs.map((d) => (
                        <div
                          key={d.id}
                          className={`border rounded-lg p-2 text-left ${d.status === "rejected" ? "border-red-300 bg-red-50" : d.status === "approved" ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}
                        >
                          <button
                            onClick={() => setImageModal(d.url)}
                            className="w-full"
                          >
                            <div className="aspect-video bg-slate-100 rounded mb-1 overflow-hidden flex items-center justify-center">
                              {d.url?.endsWith(".mp4") || d.url?.endsWith(".mov") ? (
                                <div className="flex flex-col items-center gap-1 text-slate-400">
                                  <Eye size={20} />
                                  <span className="text-[10px]">Video</span>
                                </div>
                              ) : (
                                <StorageImage
                                  objectPath={d.url}
                                  alt={DOC_TYPE_LABELS[d.type] || d.type}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          </button>
                          <p className="text-xs font-semibold text-slate-800">
                            {DOC_TYPE_LABELS[d.type] || d.label || d.type}
                            {REQUIRED_DOC_TYPES.includes(d.type) && (
                              <span className="ml-1 text-red-500 font-normal">*required</span>
                            )}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${d.status === "approved" ? "bg-green-100 text-green-700" : d.status === "rejected" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                              {d.status}
                            </span>
                            <div className="flex gap-1">
                              <button
                                title="Approve doc"
                                disabled={d.status === "approved"}
                                onClick={() => api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }).then(() => { setDocs(prev => prev.map(x => x.id === d.id ? { ...x, status: "approved" } : x)); })}
                                className="p-0.5 rounded hover:bg-green-100 text-green-600 disabled:opacity-30"
                              >
                                <ShieldCheck size={13} />
                              </button>
                              <button
                                title="Reject doc"
                                disabled={d.status === "rejected"}
                                onClick={() => { const reason = prompt(`Reason for rejecting ${DOC_TYPE_LABELS[d.type] || d.type}?`)?.trim(); if (!reason) return; api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", rejectionNote: reason }) }).then(() => { setDocs(prev => prev.map(x => x.id === d.id ? { ...x, status: "rejected", rejectionNote: reason } : x)); }); }}
                                className="p-0.5 rounded hover:bg-red-100 text-red-500 disabled:opacity-30"
                              >
                                <ShieldX size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setStatus(selected, "approved")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <ShieldCheck size={16} /> Approve
                </button>
                <button
                  onClick={() => setStatus(selected, "in_process")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <Hourglass size={16} /> Mark In Process
                </button>
                <button
                  onClick={() =>
                    setRejectionDialog({ target: selected, note: "" })
                  }
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <ShieldX size={16} /> Reject
                </button>
                <button
                  onClick={() => setStatus(selected, "pending")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <Clock size={16} /> Reset to Pending
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="ml-auto px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection note dialog */}
      {rejectionDialog && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">
                Reject {rejectionDialog.target.name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                The provider will be notified with the reason below.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={rejectionDialog.note}
                onChange={(e) =>
                  setRejectionDialog({
                    ...rejectionDialog,
                    note: e.target.value,
                  })
                }
                rows={4}
                placeholder="e.g. CNIC photo is blurry. Please re-upload a clear image of the front side."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRejectionDialog(null)}
                  className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    setStatus(
                      rejectionDialog.target,
                      "rejected",
                      rejectionDialog.note
                    )
                  }
                  disabled={!!actionLoading}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reject Provider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-size Image Modal */}
      {imageModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
          onClick={() => setImageModal(null)}
        >
          <div
            className="relative max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setImageModal(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg text-slate-600 hover:text-slate-900 z-10"
            >
              <X size={18} />
            </button>
            <StorageImage
              objectPath={imageModal}
              alt="Document"
              className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

