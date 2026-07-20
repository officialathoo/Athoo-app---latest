import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2, Loader2, XCircle } from "lucide-react";
import { api, formatDate } from "@/lib/api";
import type { ProviderDocumentUpdateRequest } from "@/lib/types";
import { StorageImage } from "@/components/ui/StorageImage";
import { useToast } from "@/hooks/use-toast";

const LABELS: Record<string, string> = {
  cnic_front: "CNIC Front",
  cnic_back: "CNIC Back",
  police: "Police Verification",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatValidity(request: ProviderDocumentUpdateRequest) {
  if (request.expiryNotApplicable) return "Lifetime validity";
  const expiry = request.expiresAt ? formatDate(request.expiresAt) : "Missing";
  if (request.documentType !== "police") return `Valid until ${expiry}`;
  const issue = request.issuedAt ? formatDate(request.issuedAt) : "Missing";
  return `Issued ${issue} · Valid until ${expiry}`;
}

export function DocumentRenewalsPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const focusId = searchParams.get("focus") || "";
  const providerFilter = searchParams.get("provider") || "";
  const requestedStatus = searchParams.get("status") || "pending";
  const initialStatus = ["pending", "approved", "rejected", "cancelled", "all"].includes(requestedStatus)
    ? requestedStatus
    : "pending";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(initialStatus);
  const [selected, setSelected] = useState<ProviderDocumentUpdateRequest | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [focusOpened, setFocusOpened] = useState(false);

  const query = useQuery({
    queryKey: ["document-renewals", status],
    queryFn: () => api<{ requests: ProviderDocumentUpdateRequest[] }>("/api/admin/document-renewals", {
      params: { status, limit: 200 },
    }),
    staleTime: 15_000,
  });

  const review = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "approved" | "rejected"; note?: string }) =>
      api(`/api/admin/document-renewals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: decision, rejectionNote: note || "" }),
      }),
    onSuccess: (_data, variables) => {
      toast({ title: variables.decision === "approved" ? "Document approved" : "Document rejected" });
      setSelected(null);
      setRejectionNote("");
      void queryClient.invalidateQueries({ queryKey: ["document-renewals"] });
      void queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (error: Error) => toast({ title: "Review failed", description: error.message, variant: "destructive" }),
  });

  const requests = useMemo(() => {
    const all = query.data?.requests || [];
    return providerFilter ? all.filter((request) => request.providerId === providerFilter) : all;
  }, [providerFilter, query.data?.requests]);

  useEffect(() => {
    if (!focusId || focusOpened || !requests.length) return;
    const request = requests.find((item) => item.id === focusId);
    if (!request) return;
    setSelected(request);
    setRejectionNote(request.rejectionNote || "");
    setFocusOpened(true);
  }, [focusId, focusOpened, requests]);

  function rejectSelected() {
    if (!selected) return;
    const note = rejectionNote.trim();
    if (note.length < 3) {
      toast({ title: "Rejection reason required", description: "Enter a clear reason before rejecting the document.", variant: "destructive" });
      return;
    }
    review.mutate({ id: selected.id, decision: "rejected", note });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Document Renewal Requests</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review replacement CNIC and police-verification documents without overwriting the approved record first.</p>
        </div>
        {status === "pending" && requests.length > 0 ? (
          <span className="w-fit rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            {requests.length} pending
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {["pending", "approved", "rejected", "cancelled", "all"].map((value) => (
          <button
            key={value}
            onClick={() => { setStatus(value); setFocusOpened(false); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              status === value ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="flex h-52 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={22} />Loading requests…</div>
      ) : query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{(query.error as Error).message || "Could not load renewal requests."}</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <FileCheck2 className="mx-auto mb-3 text-slate-300" size={38} />
          <p className="font-medium text-slate-600">No {status === "all" ? "" : status} document renewal requests</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Document</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Validity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Compliance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Submitted</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((request) => (
                  <tr key={request.id} className={request.id === focusId ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{request.provider.name}</p>
                      <p className="text-xs text-slate-500">{request.provider.phone}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{LABELS[request.documentType] || request.documentType}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatValidity(request)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${request.provider.documentSuspendedAt ? "text-red-700" : "text-slate-600"}`}>
                        {request.provider.documentSuspendedAt ? "Temporarily paused" : (request.provider.documentComplianceStatus || "active").replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(request.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[request.status] || STATUS_STYLE.cancelled}`}>{request.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setSelected(request); setRejectionNote(request.rejectionNote || ""); }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {request.status === "pending" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="font-semibold text-slate-800">{LABELS[selected.documentType]} Renewal</h2>
                <p className="mt-0.5 text-xs text-slate-500">{selected.provider.name} · {selected.provider.phone}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[selected.status]}`}>{selected.status}</span>
            </div>

            <div className="space-y-4 p-5">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <StorageImage objectPath={selected.url} alt={`${LABELS[selected.documentType]} replacement`} className="max-h-[430px] w-full object-contain" />
              </div>

              <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-slate-500">Document</p><p className="font-semibold text-slate-800">{LABELS[selected.documentType]}</p></div>
                <div><p className="text-xs text-slate-500">Submitted</p><p className="font-semibold text-slate-800">{formatDate(selected.createdAt)}</p></div>
                {selected.documentType === "police" ? <div><p className="text-xs text-slate-500">Issue date</p><p className="font-semibold text-slate-800">{selected.issuedAt ? formatDate(selected.issuedAt) : "Missing"}</p></div> : null}
                <div><p className="text-xs text-slate-500">Valid until</p><p className="font-semibold text-slate-800">{selected.expiryNotApplicable ? "Lifetime" : selected.expiresAt ? formatDate(selected.expiresAt) : "Missing"}</p></div>
              </div>

              {selected.status === "pending" ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Rejection reason</label>
                  <textarea
                    value={rejectionNote}
                    onChange={(event) => setRejectionNote(event.target.value)}
                    rows={3}
                    placeholder="Required only when rejecting…"
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : selected.rejectionNote ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{selected.rejectionNote}</div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-5">
              <button onClick={() => setSelected(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
              {selected.status === "pending" ? (
                <>
                  <button
                    onClick={rejectSelected}
                    disabled={review.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {review.isPending ? <Loader2 className="animate-spin" size={15} /> : <XCircle size={15} />} Reject
                  </button>
                  <button
                    onClick={() => review.mutate({ id: selected.id, decision: "approved" })}
                    disabled={review.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {review.isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Approve & Apply
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
