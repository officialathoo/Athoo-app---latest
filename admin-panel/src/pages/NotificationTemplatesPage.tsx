import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Bell, Plus, Pencil, Trash2, Loader2, Save, X, Send, Megaphone, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

type NotificationTemplate = {
  id: string;
  key: string;
  name: string;
  channel: string;
  targetAudience: string;
  subject?: string;
  body: string;
  isActive: boolean;
};

const CHANNEL_STYLE: Record<string, string> = {
  push: "bg-blue-100 text-blue-700",
  sms: "bg-purple-100 text-purple-700",
  email: "bg-emerald-100 text-emerald-700",
};

const AUDIENCE_STYLE: Record<string, string> = {
  all: "bg-slate-100 text-slate-600",
  customer: "bg-sky-100 text-sky-700",
  provider: "bg-orange-100 text-orange-700",
};

const DEFAULT_TEMPLATES = [
  { key: "booking_confirmed", name: "Booking Confirmed", channel: "push", targetAudience: "customer", body: "Your booking for {{service}} is confirmed! Provider {{providerName}} will arrive on {{date}} at {{time}}." },
  { key: "provider_accepted", name: "Provider Accepted Job", channel: "push", targetAudience: "provider", body: "New job accepted! {{customerName}} has booked {{service}} for {{date}} at {{time}}. Address: {{address}}" },
  { key: "provider_arriving", name: "Provider Arriving", channel: "push", targetAudience: "customer", body: "{{providerName}} is on the way! They should arrive shortly." },
  { key: "job_started", name: "Job Started", channel: "push", targetAudience: "customer", body: "Your {{service}} job has started. Elapsed time is being tracked." },
  { key: "job_completed", name: "Job Completed", channel: "push", targetAudience: "customer", body: "Job completed! Please rate {{providerName}} for {{service}}. Total: Rs. {{amount}}" },
  { key: "payment_received", name: "Commission Received", channel: "push", targetAudience: "provider", body: "Commission payment of Rs. {{amount}} received. Thank you!" },
  { key: "booking_cancelled", name: "Booking Cancelled", channel: "push", targetAudience: "all", body: "Booking #{{bookingId}} for {{service}} has been cancelled." },
  { key: "withdrawal_approved", name: "Withdrawal Approved", channel: "push", targetAudience: "provider", body: "Your withdrawal of Rs. {{amount}} has been approved and will be processed within 2 business days." },
];

export function NotificationTemplatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("settings.write");
  const canBroadcast = hasPermission("notifications.write");
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("all");
  const [form, setForm] = useState({ key: "", name: "", channel: "push", targetAudience: "all", subject: "", body: "", isActive: true });

  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<"all" | "customer" | "provider">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => api<{ templates: NotificationTemplate[] }>("/api/admin/notification-templates"),
    staleTime: 60000,
  });

  const broadcastMutation = useMutation({
    mutationFn: () => api<{
      sent: number;
      audience: string;
      tokenCount: number;
      inAppCount: number;
      onlineCount: number;
      failedCount: number;
    }>("/api/admin/broadcast-push", {
      method: "POST",
      body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, audience: broadcastAudience }),
    }),
    onSuccess: (d) => {
      toast({
        title: "Broadcast processed",
        description: `${d.inAppCount} in-app · ${d.sent} push accepted · ${d.onlineCount} online${d.failedCount ? ` · ${d.failedCount} push failed` : ""}`,
      });
      setBroadcastTitle("");
      setBroadcastBody("");
      setBroadcastAudience("all");
      setShowBroadcast(false);
    },
    onError: (e: any) => toast({ title: e?.message || "Broadcast failed", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      api("/api/admin/notification-templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Template created" });
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
      setShowAdd(false);
      setForm({ key: "", name: "", channel: "push", targetAudience: "all", subject: "", body: "", isActive: true });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to create", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: Record<string, any>) =>
      api(`/api/admin/notification-templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Template updated" });
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
      setEditing(null);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/notification-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Template deleted" });
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      Promise.allSettled(DEFAULT_TEMPLATES.map(t =>
        api("/api/admin/notification-templates", { method: "POST", body: JSON.stringify(t) })
      )),
    onSuccess: () => {
      toast({ title: "Default templates seeded" });
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
    },
  });

  const allTemplates = data?.templates ?? [];
  const templates = channelFilter === "all" ? allTemplates : allTemplates.filter(t => t.channel === channelFilter);

  function TemplateForm({ onSubmit, onCancel, loading }: { onSubmit: (f: any) => void; onCancel: () => void; loading: boolean }) {
    return (
      <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Template Key * <span className="text-slate-400">(unique identifier)</span></label>
            <input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g, "_") }))}
              disabled={!!editing}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              placeholder="booking_confirmed" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Display Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Booking Confirmed" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Channel *</label>
            <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="push">Push Notification</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Audience</label>
            <select value={form.targetAudience} onChange={e => setForm(f => ({ ...f, targetAudience: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All</option>
              <option value="customer">Customer</option>
              <option value="provider">Provider</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              <span className="text-sm text-slate-700">Active</span>
            </label>
          </div>
        </div>
        {form.channel === "email" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email Subject</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your booking is confirmed" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Body * <span className="text-slate-400">— use {"{{variableName}}"} for placeholders</span>
          </label>
          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            rows={4} placeholder="Your booking for {{service}} is confirmed…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={() => onSubmit(form)} disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5">
            <Save size={14} /> {loading ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Broadcast Push Panel */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white overflow-hidden shadow-sm">
        <button
          onClick={() => setShowBroadcast(!showBroadcast)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Megaphone size={18} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm">Send Broadcast Push Notification</p>
              <p className="text-blue-100 text-xs mt-0.5">Send a push notification to all users, customers, or providers</p>
            </div>
          </div>
          <ChevronDown size={18} className={`text-blue-200 transition-transform ${showBroadcast ? "rotate-180" : ""}`} />
        </button>

        {canBroadcast && showBroadcast && (
          <div className="px-5 pb-5 border-t border-white/20 pt-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-blue-100 mb-1">Notification Title *</label>
                <input
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder="e.g. Special Offer This Weekend!"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-100 mb-1">Send To</label>
                <select
                  value={broadcastAudience}
                  onChange={e => setBroadcastAudience(e.target.value as "all" | "customer" | "provider")}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  <option value="all" className="text-slate-800">All Users</option>
                  <option value="customer" className="text-slate-800">Customers Only</option>
                  <option value="provider" className="text-slate-800">Providers Only</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-100 mb-1">Message *</label>
              <textarea
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value)}
                rows={3}
                placeholder="Write your broadcast message here…"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/40 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBroadcast(false)} className="px-4 py-2 text-sm text-blue-200 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => broadcastMutation.mutate()}
                disabled={!broadcastTitle.trim() || !broadcastBody.trim() || broadcastMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-white text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {broadcastMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {broadcastMutation.isPending ? "Sending…" : "Send Broadcast"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Notification Templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage push, SMS, and email notification content</p>
        </div>
        <div className="flex gap-2">
          {allTemplates.length === 0 && (
            <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
              Seed Defaults
            </button>
          )}
          <button onClick={() => { setShowAdd(!showAdd); setEditing(null); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            {showAdd ? <X size={15} /> : <Plus size={15} />}
            {showAdd ? "Cancel" : "Add Template"}
          </button>
        </div>
      </div>

      {canWrite && showAdd && (
        <TemplateForm onSubmit={f => createMutation.mutate(f)} onCancel={() => setShowAdd(false)} loading={createMutation.isPending} />
      )}

      {/* Channel filter */}
      <div className="flex gap-2">
        {["all", "push", "sms", "email"].map(ch => (
          <button key={ch} onClick={() => setChannelFilter(ch)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${channelFilter === ch ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {ch === "all" ? "All Channels" : ch.toUpperCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Bell size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No templates yet</p>
          <p className="text-slate-400 text-sm mt-1">Add templates or seed defaults to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id}>
              {editing?.id === t.id ? (
                <TemplateForm
                  onSubmit={f => updateMutation.mutate({ id: t.id, ...f })}
                  onCancel={() => setEditing(null)}
                  loading={updateMutation.isPending}
                />
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CHANNEL_STYLE[t.channel] || "bg-slate-100 text-slate-600"}`}>
                          {t.channel.toUpperCase()}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${AUDIENCE_STYLE[t.targetAudience] || ""}`}>
                          {t.targetAudience}
                        </span>
                        {!t.isActive && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>}
                        <span className="text-xs text-slate-400 font-mono">{t.key}</span>
                      </div>
                      <p className="font-medium text-slate-800 text-sm">{t.name}</p>
                      {t.subject && <p className="text-xs text-slate-500 mt-0.5">Subject: {t.subject}</p>}
                      <p className="text-sm text-slate-600 mt-1.5 line-clamp-2 font-mono bg-slate-50 rounded px-2 py-1">{t.body}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canWrite && <>
                        <button onClick={() => { setEditing(t); setForm({ key: t.key, name: t.name, channel: t.channel, targetAudience: t.targetAudience, subject: t.subject || "", body: t.body, isActive: t.isActive }); setShowAdd(false); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil size={14} />
                        </button>
                        {confirmDeleteId === t.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => { deleteMutation.mutate(t.id); setConfirmDeleteId(null); }} className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">Deactivate</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(t.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>}
                    </div>
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
