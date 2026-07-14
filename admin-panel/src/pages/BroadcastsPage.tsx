import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatDate } from "@/lib/api";
import type { Broadcast, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { SearchableSelect } from "@/components/admin/SearchableSelect";
import { Megaphone, Plus, Loader2, ChevronDown, ChevronUp, Users, Send, RefreshCw } from "lucide-react";

type BroadcastTemplate = {
  id: string;
  key: string;
  name: string;
  subject?: string | null;
  body: string;
  targetAudience: string;
};

export function BroadcastsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("broadcasts.write");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", audience: "all", targetUserIds: "", templateId: "" });
  const [formError, setFormError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [userSearch]);

  const broadcastsQ = useQuery({
    queryKey: ["admin", "broadcasts"],
    queryFn: () => api<{ broadcasts: Broadcast[] }>("/api/admin/broadcasts"),
    staleTime: 15_000,
  });
  const templatesQ = useQuery({
    queryKey: ["admin", "broadcast-templates"],
    queryFn: () => api<{ templates: BroadcastTemplate[] }>("/api/admin/broadcast-templates"),
    enabled: showForm,
    staleTime: 60_000,
  });
  const usersQ = useQuery({
    queryKey: ["admin", "broadcast-users", debouncedUserSearch],
    queryFn: () => api<{ users: User[] }>("/api/admin/users", {
      params: debouncedUserSearch ? { search: debouncedUserSearch, limit: 30 } : { limit: 30 },
    }),
    enabled: showForm,
    staleTime: 10_000,
  });

  const sendMutation = useMutation({
    mutationFn: (payload: { title: string; message: string; audience: string; targetUserIds: string[] }) =>
      api("/api/admin/broadcasts", { method: "POST", body: payload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      setForm({ title: "", message: "", audience: "all", targetUserIds: "", templateId: "" });
      setUserSearch("");
      setShowTemplates(false);
      setShowForm(false);
      toast({ title: "Broadcast sent", description: "The message was saved and delivered to the selected audience." });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const broadcasts = broadcastsQ.data?.broadcasts ?? [];
  const templates = templatesQ.data?.templates ?? [];
  const users = usersQ.data?.users ?? [];
  const selectedUserIds = useMemo(() => form.targetUserIds.split(",").map((value) => value.trim()).filter(Boolean), [form.targetUserIds]);

  function toggleTargetUser(userId: string) {
    const next = selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId];
    setForm((current) => ({ ...current, targetUserIds: next.join(",") }));
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const audience = template.targetAudience === "customer" ? "customers" : template.targetAudience === "provider" ? "providers" : "all";
    setForm((current) => ({
      ...current,
      templateId,
      title: template.subject?.trim() || template.name,
      message: template.body,
      audience,
      targetUserIds: "",
    }));
    setShowTemplates(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setFormError("Title and message are required.");
      return;
    }
    if (form.message.length > 500) {
      setFormError("Broadcast message must be 500 characters or fewer.");
      return;
    }
    setFormError("");
    sendMutation.mutate({
      title: form.title.trim(),
      message: form.message.trim(),
      audience: selectedUserIds.length ? "specific" : form.audience,
      targetUserIds: selectedUserIds,
    });
  }

  const audienceLabel = selectedUserIds.length
    ? `${selectedUserIds.length} specific user${selectedUserIds.length === 1 ? "" : "s"}`
    : form.audience === "customers" ? "Customers only"
      : form.audience === "providers" ? "Providers only"
        : "Everyone";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Broadcasts</h1>
          <p className="text-sm text-slate-500">Send audited announcements using live admin-managed templates.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => broadcastsQ.refetch()} disabled={broadcastsQ.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={broadcastsQ.isFetching ? "animate-spin" : ""} /> Refresh
          </button>
          {canWrite ? <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"><Plus size={16} /> New Broadcast</button> : null}
        </div>
      </div>

      {broadcastsQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={24} className="mr-2 animate-spin" /><span className="text-sm">Loading broadcasts...</span></div>
      ) : broadcastsQ.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><p className="font-medium text-red-800">Unable to load broadcasts</p><p className="mt-1 text-sm text-red-600">{(broadcastsQ.error as Error).message}</p><button onClick={() => broadcastsQ.refetch()} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Retry</button></div>
      ) : broadcasts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center shadow-sm"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50"><Megaphone size={28} className="text-blue-500" /></div><p className="mb-1 text-base font-semibold text-slate-700">No broadcasts yet</p><p className="text-sm text-slate-400">Send announcements to everyone, a role, or selected users.</p></div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((broadcast) => {
            const audienceColors: Record<string, string> = { all: "bg-slate-100 text-slate-600", customers: "bg-sky-100 text-sky-700", providers: "bg-orange-100 text-orange-700", specific: "bg-purple-100 text-purple-700" };
            return <div key={broadcast.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50"><Megaphone size={18} className="text-blue-600" /></div><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{broadcast.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${audienceColors[broadcast.audience] || audienceColors.all}`}><Users size={10} className="mr-1 inline" />{broadcast.audience}</span>{typeof broadcast.sentCount === "number" ? <span className="text-xs text-slate-400">{broadcast.sentCount} recipients</span> : null}</div><p className="text-sm text-slate-600">{broadcast.message}</p><p className="mt-2 text-xs text-slate-400">{formatDate(broadcast.createdAt)}</p></div></div></div>;
          })}
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-6"><div><h3 className="text-base font-semibold text-slate-800">New Broadcast</h3><p className="mt-0.5 text-xs text-slate-400">Sending to: <span className="font-medium text-slate-600">{audienceLabel}</span></p></div><button onClick={() => setShowForm(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button></div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div>
                <button type="button" onClick={() => setShowTemplates((current) => !current)} className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700">{showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Live notification templates</button>
                {showTemplates ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{templatesQ.isLoading ? <div className="flex items-center justify-center py-5 text-sm text-slate-500"><Loader2 size={15} className="mr-2 animate-spin" />Loading templates...</div> : templatesQ.isError ? <p className="py-3 text-center text-sm text-red-600">{(templatesQ.error as Error).message}</p> : templates.length ? <SearchableSelect value={form.templateId} onChange={applyTemplate} options={templates.map((template) => ({ value: template.id, label: template.name, description: `${template.targetAudience} · ${template.body.slice(0, 90)}`, keywords: [template.key, template.body] }))} placeholder="Choose a live template" searchPlaceholder="Search template name or content" /> : <p className="py-3 text-center text-sm text-slate-500">No active push templates. Create one in Notification Templates.</p>}</div> : null}
              </div>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Title</span><input type="text" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Broadcast title" maxLength={200} required /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Message</span><textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} rows={5} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Write your broadcast message here..." maxLength={500} required /><span className={`mt-1 block text-right text-xs ${form.message.length > 480 ? "text-amber-600" : "text-slate-400"}`}>{form.message.length} / 500</span></label>
              <div><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Audience</span><div className="grid grid-cols-3 gap-2">{[{ value: "all", label: "Everyone", desc: "All users" }, { value: "customers", label: "Customers", desc: "Customers only" }, { value: "providers", label: "Providers", desc: "Providers only" }].map((option) => <button key={option.value} type="button" onClick={() => setForm((current) => ({ ...current, audience: option.value, targetUserIds: "" }))} className={`rounded-xl border-2 p-3 text-left transition-all ${form.audience === option.value && !selectedUserIds.length ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><p className="text-xs font-semibold text-slate-700">{option.label}</p><p className="text-[11px] text-slate-400">{option.desc}</p></button>)}</div></div>
              <div className="space-y-2"><span className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Specific Users <span className="font-normal normal-case text-slate-400">(optional — overrides audience)</span></span><input type="text" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search by name, email, or phone" />{selectedUserIds.length ? <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"><Users size={13} className="shrink-0 text-blue-600" /><span className="text-xs font-semibold text-blue-700">{selectedUserIds.length} selected</span><button type="button" onClick={() => setForm((current) => ({ ...current, targetUserIds: "" }))} className="ml-auto text-xs text-blue-500 hover:text-blue-700">Clear</button></div> : null}<div className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-50">{usersQ.isFetching ? <div className="flex items-center justify-center px-3 py-4 text-sm text-slate-500"><Loader2 size={14} className="mr-2 animate-spin" />Searching...</div> : users.length ? users.map((user) => { const checked = selectedUserIds.includes(user.id); return <button key={user.id} type="button" onClick={() => toggleTargetUser(user.id)} className={`w-full border-b border-slate-200 px-3 py-2.5 text-left last:border-b-0 ${checked ? "bg-blue-50" : "hover:bg-white"}`}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-800">{user.name || "Unnamed"}</div><div className="truncate text-xs text-slate-500">{user.phone}{user.email ? ` · ${user.email}` : ""}</div></div><div className={`rounded-full px-2 py-1 text-xs font-semibold ${checked ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{checked ? "✓" : user.role}</div></div></button>; }) : <div className="px-3 py-4 text-center text-sm text-slate-500">No matching users</div>}</div></div>
              {formError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</div> : null}
              <div className="flex gap-2 pt-2"><button type="submit" disabled={sendMutation.isPending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{sendMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{sendMutation.isPending ? "Sending..." : "Send Broadcast"}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
