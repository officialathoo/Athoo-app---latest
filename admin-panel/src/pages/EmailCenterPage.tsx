import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  PauseCircle,
  Play,
  RefreshCw,
  Send,
  ServerCog,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

type EmailConfiguration = {
  provider: "smtp" | "console" | "disabled";
  configuredProvider?: string;
  configured: boolean;
  hostConfigured: boolean;
  userConfigured: boolean;
  passwordConfigured: boolean;
  fromConfigured: boolean;
  port: number;
  secure: boolean;
  requireTls: boolean;
  pooled: boolean;
};

type EmailStatusResponse = {
  config: EmailConfiguration;
  deliveryCounts: Record<string, number>;
  marketingEnabled: boolean;
  marketingMaxRecipients: number;
};

type EmailDelivery = {
  id: string;
  toEmail: string;
  templateKey: string;
  category: string;
  subject?: string | null;
  provider?: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  queuedAt?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
};

type EmailCampaign = {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: string;
  category: string;
  status: string;
  scheduledAt?: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt?: string | null;
};

type Pagination = { limit: number; offset: number; total: number };

type CampaignForm = {
  name: string;
  subject: string;
  body: string;
  audience: "all" | "customer" | "provider" | "premium";
  category: "marketing" | "product";
  scheduledAt: string;
};

const EMPTY_CAMPAIGN: CampaignForm = {
  name: "",
  subject: "",
  body: "",
  audience: "all",
  category: "marketing",
  scheduledAt: "",
};

const DELIVERY_STATUSES = ["all", "queued", "sending", "retrying", "sent", "failed", "suppressed"] as const;

function readable(value: string | null | undefined): string {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusClass(status: string): string {
  if (status === "sent" || status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed" || status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "suppressed") return "bg-amber-100 text-amber-700";
  if (status === "sending" || status === "queued" || status === "retrying") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(status)}`}>{readable(status)}</span>;
}

function ConfigItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
      <span className="text-xs text-slate-600">{label}</span>
      {ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-500" />}
    </div>
  );
}

export function EmailCenterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canConfigure = hasPermission("settings.write");
  const canViewCampaigns = hasPermission("marketing.read");
  const canManageCampaigns = hasPermission("marketing.write");
  const [testRecipient, setTestRecipient] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<(typeof DELIVERY_STATUSES)[number]>("all");
  const [deliveryOffset, setDeliveryOffset] = useState(0);
  const [campaignOffset, setCampaignOffset] = useState(0);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(EMPTY_CAMPAIGN);
  const pageSize = 25;

  const statusQuery = useQuery({
    queryKey: ["email-center-status"],
    queryFn: () => api<EmailStatusResponse>("/api/admin/email/status"),
    refetchInterval: 60_000,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["email-deliveries", deliveryStatus, deliveryOffset],
    queryFn: () => api<{ deliveries: EmailDelivery[]; pagination: Pagination }>("/api/admin/email/deliveries", {
      params: { limit: pageSize, offset: deliveryOffset, status: deliveryStatus === "all" ? undefined : deliveryStatus },
    }),
    refetchInterval: 30_000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["email-campaigns", campaignOffset],
    queryFn: () => api<{ campaigns: EmailCampaign[]; pagination: Pagination }>("/api/admin/email/campaigns", {
      params: { limit: pageSize, offset: campaignOffset },
    }),
    enabled: canViewCampaigns,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["email-center-status"] });
    void queryClient.invalidateQueries({ queryKey: ["email-deliveries"] });
    void queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
  };

  const verifyMutation = useMutation({
    mutationFn: () => api<{ ok: boolean; provider: string; error?: string }>("/api/admin/email/verify-transport", { method: "POST" }),
    onSuccess: (result) => {
      toast({ title: "Email transport verified", description: `Provider adapter: ${readable(result.provider)}` });
      refreshAll();
    },
    onError: (error: Error) => toast({ title: "Transport verification failed", description: error.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () => api<{ ok: boolean; deliveryId: string; errorCode?: string }>("/api/admin/email/test", {
      method: "POST",
      body: { to: testRecipient.trim() },
    }),
    onSuccess: () => {
      toast({ title: "Test email sent", description: `Delivery was submitted to ${testRecipient.trim()}.` });
      refreshAll();
    },
    onError: (error: Error) => toast({ title: "Test email failed", description: error.message, variant: "destructive" }),
  });

  const createCampaignMutation = useMutation({
    mutationFn: () => api<{ campaign: EmailCampaign }>("/api/admin/email/campaigns", {
      method: "POST",
      body: {
        name: campaignForm.name.trim(),
        subject: campaignForm.subject.trim(),
        body: campaignForm.body.trim(),
        audience: campaignForm.audience,
        category: campaignForm.category,
        scheduledAt: campaignForm.scheduledAt ? new Date(campaignForm.scheduledAt).toISOString() : null,
      },
    }),
    onSuccess: () => {
      toast({ title: "Email campaign saved as draft" });
      setCampaignForm(EMPTY_CAMPAIGN);
      setShowCampaignForm(false);
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (error: Error) => toast({ title: "Campaign could not be created", description: error.message, variant: "destructive" }),
  });

  const sendCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api<{ success: boolean; jobId: string }>(`/api/admin/email/campaigns/${campaignId}/send`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Campaign queued", description: "Recipients will be filtered by verification and consent before delivery." });
      refreshAll();
    },
    onError: (error: Error) => toast({ title: "Campaign could not be queued", description: error.message, variant: "destructive" }),
  });

  const cancelCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api(`/api/admin/email/campaigns/${campaignId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Campaign cancelled" });
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (error: Error) => toast({ title: "Campaign could not be cancelled", description: error.message, variant: "destructive" }),
  });

  const status = statusQuery.data;
  const deliveries = deliveriesQuery.data?.deliveries || [];
  const deliveryPagination = deliveriesQuery.data?.pagination;
  const campaigns = campaignsQuery.data?.campaigns || [];
  const campaignPagination = campaignsQuery.data?.pagination;
  const totalDeliveries = useMemo(
    () => Object.values(status?.deliveryCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0),
    [status?.deliveryCounts],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Email Delivery Center</h1>
          <p className="mt-1 text-sm text-slate-500">Provider-neutral transactional email, verification, delivery logs, consent, and campaigns.</p>
        </div>
        <button onClick={refreshAll} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {statusQuery.isError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Email status could not be loaded</p><p>{(statusQuery.error as Error).message}</p></div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><ServerCog size={20} /></div>
              <div><h2 className="font-semibold text-slate-900">Delivery configuration</h2><p className="text-xs text-slate-500">Secrets remain in deployment environment variables.</p></div>
            </div>
            {status?.config && <StatusPill status={status.config.configured ? "configured" : "not_configured"} />}
          </div>
          {statusQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : status?.config ? (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ConfigItem label="SMTP host" ok={status.config.hostConfigured} />
                <ConfigItem label="SMTP user" ok={status.config.userConfigured} />
                <ConfigItem label="SMTP password" ok={status.config.passwordConfigured} />
                <ConfigItem label="Sender address" ok={status.config.fromConfigured} />
              </div>
              <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-4">
                <div><span className="block text-slate-400">Adapter</span><strong>{readable(status.config.provider)}</strong></div>
                <div><span className="block text-slate-400">Configured label</span><strong>{readable(status.config.configuredProvider || status.config.provider)}</strong></div>
                <div><span className="block text-slate-400">Port / security</span><strong>{status.config.port} · {status.config.secure ? "TLS" : status.config.requireTls ? "STARTTLS" : "Provider policy"}</strong></div>
                <div><span className="block text-slate-400">Connection pool</span><strong>{status.config.pooled ? "Enabled" : "Disabled"}</strong></div>
              </div>
            </>
          ) : null}
          {canConfigure && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {verifyMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Verify transport
              </button>
              <label className="min-w-[240px] flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600">Test recipient</span>
                <input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="you@yourdomain.com" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !/^\S+@\S+\.\S+$/.test(testRecipient.trim())} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {testMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send test
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Mail size={20} /></div><div><h2 className="font-semibold text-slate-900">Delivery summary</h2><p className="text-xs text-slate-500">All recorded email attempts</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Total</p><p className="text-2xl font-bold text-slate-900">{totalDeliveries}</p></div>
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Sent</p><p className="text-2xl font-bold text-emerald-700">{status?.deliveryCounts?.sent || 0}</p></div>
            <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-blue-700">Queued</p><p className="text-2xl font-bold text-blue-700">{(status?.deliveryCounts?.queued || 0) + (status?.deliveryCounts?.retrying || 0)}</p></div>
            <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-700">Failed</p><p className="text-2xl font-bold text-red-700">{status?.deliveryCounts?.failed || 0}</p></div>
          </div>
          <div className="mt-4 rounded-lg border border-slate-100 p-3 text-xs text-slate-600">
            <div className="flex justify-between"><span>Campaign delivery</span><strong>{status?.marketingEnabled ? "Enabled" : "Disabled"}</strong></div>
            <div className="mt-2 flex justify-between"><span>Recipient safety cap</span><strong>{status?.marketingMaxRecipients || 0}</strong></div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-semibold text-slate-900">Delivery log</h2><p className="text-xs text-slate-500">Provider-neutral status, retry, suppression and audit information.</p></div>
          <select value={deliveryStatus} onChange={(event) => { setDeliveryStatus(event.target.value as (typeof DELIVERY_STATUSES)[number]); setDeliveryOffset(0); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {DELIVERY_STATUSES.map((item) => <option key={item} value={item}>{readable(item)}</option>)}
          </select>
        </div>
        {deliveriesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : deliveriesQuery.isError ? (
          <div className="p-6 text-sm text-red-600">{(deliveriesQuery.error as Error).message}</div>
        ) : deliveries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500"><Mail className="mx-auto mb-2 text-slate-300" />No matching email deliveries.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Template</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Queued</th><th className="px-4 py-3">Error</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{delivery.toEmail}</p><p className="max-w-[240px] truncate text-xs text-slate-400">{delivery.subject || "Subject resolved at delivery"}</p></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{delivery.templateKey}</td>
                    <td className="px-4 py-3 text-slate-600">{readable(delivery.category)}</td>
                    <td className="px-4 py-3"><StatusPill status={delivery.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{delivery.attempts}/{delivery.maxAttempts}</td>
                    <td className="px-4 py-3 text-slate-600">{readable(delivery.provider)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(delivery.queuedAt)}</td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-red-600">{delivery.lastError || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>{deliveryPagination ? `${deliveryPagination.total} total deliveries` : ""}</span>
          <div className="flex gap-2"><button disabled={deliveryOffset === 0} onClick={() => setDeliveryOffset(Math.max(0, deliveryOffset - pageSize))} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={!deliveryPagination || deliveryOffset + pageSize >= deliveryPagination.total} onClick={() => setDeliveryOffset(deliveryOffset + pageSize)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div>
        </div>
      </section>

      {canViewCampaigns && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-semibold text-slate-900">Email campaigns</h2><p className="text-xs text-slate-500">Only verified, active and consent-eligible recipients are queued.</p></div>
            {canManageCampaigns && <button onClick={() => setShowCampaignForm((value) => !value)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Mail size={15} />{showCampaignForm ? "Close form" : "New campaign"}</button>}
          </div>

          {showCampaignForm && canManageCampaigns && (
            <div className="border-b border-slate-100 bg-slate-50 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label><span className="mb-1 block text-xs font-medium text-slate-600">Campaign name</span><input value={campaignForm.name} onChange={(event) => setCampaignForm((form) => ({ ...form, name: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="July customer offer" /></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-600">Email subject</span><input value={campaignForm.subject} onChange={(event) => setCampaignForm((form) => ({ ...form, subject: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="A special offer for you" /></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-600">Audience</span><select value={campaignForm.audience} onChange={(event) => setCampaignForm((form) => ({ ...form, audience: event.target.value as CampaignForm["audience"] }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="all">All eligible users</option><option value="customer">Customers</option><option value="provider">Providers</option><option value="premium">Premium users</option></select></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-600">Consent category</span><select value={campaignForm.category} onChange={(event) => setCampaignForm((form) => ({ ...form, category: event.target.value as CampaignForm["category"] }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="marketing">Marketing offers</option><option value="product">Product announcements</option></select></label>
                <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-600">Schedule (optional)</span><input type="datetime-local" value={campaignForm.scheduledAt} onChange={(event) => setCampaignForm((form) => ({ ...form, scheduledAt: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
                <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-600">Message</span><textarea rows={7} value={campaignForm.body} onChange={(event) => setCampaignForm((form) => ({ ...form, body: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Write the email message. The branded responsive layout and unsubscribe footer are added automatically." /></label>
              </div>
              <div className="mt-4 flex justify-end gap-2"><button onClick={() => { setCampaignForm(EMPTY_CAMPAIGN); setShowCampaignForm(false); }} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={() => createCampaignMutation.mutate()} disabled={createCampaignMutation.isPending || campaignForm.name.trim().length < 3 || !campaignForm.subject.trim() || !campaignForm.body.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{createCampaignMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Save draft</button></div>
            </div>
          )}

          {campaignsQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : campaignsQuery.isError ? (
            <div className="p-6 text-sm text-red-600">{(campaignsQuery.error as Error).message}</div>
          ) : campaigns.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500"><Users className="mx-auto mb-2 text-slate-300" />No email campaigns have been created.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{campaign.name}</h3><StatusPill status={campaign.status} /><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{readable(campaign.audience)}</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">{readable(campaign.category)}</span></div><p className="mt-1 truncate text-sm text-slate-600">{campaign.subject}</p><p className="mt-2 text-xs text-slate-400">Created {formatDate(campaign.createdAt)}{campaign.scheduledAt ? ` · Scheduled ${formatDate(campaign.scheduledAt)}` : ""}</p></div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-50 px-3 py-2"><strong className="block text-base text-slate-800">{campaign.recipientCount}</strong>Recipients</div><div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700"><strong className="block text-base">{campaign.sentCount}</strong>Sent</div><div className="rounded-lg bg-red-50 px-3 py-2 text-red-700"><strong className="block text-base">{campaign.failedCount}</strong>Failed</div></div>
                  {canManageCampaigns && (campaign.status === "draft" || campaign.status === "queued") && <div className="flex gap-2"><button onClick={() => sendCampaignMutation.mutate(campaign.id)} disabled={campaign.status !== "draft" || !status?.marketingEnabled || sendCampaignMutation.isPending} title={!status?.marketingEnabled ? "Enable EMAIL_MARKETING_ENABLED after provider limits and consent rules are confirmed" : "Queue campaign"} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"><Play size={14} />Queue</button><button onClick={() => cancelCampaignMutation.mutate(campaign.id)} disabled={cancelCampaignMutation.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Ban size={14} />Cancel</button></div>}
                  {campaign.status === "queued" && <div className="inline-flex items-center gap-2 text-sm text-blue-600"><Clock3 size={16} />Waiting</div>}
                  {campaign.status === "sending" && <div className="inline-flex items-center gap-2 text-sm text-blue-600"><Loader2 size={16} className="animate-spin" />Sending</div>}
                  {campaign.status === "cancelled" && <div className="inline-flex items-center gap-2 text-sm text-slate-500"><PauseCircle size={16} />Cancelled</div>}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>{campaignPagination ? `${campaignPagination.total} total campaigns` : ""}</span><div className="flex gap-2"><button disabled={campaignOffset === 0} onClick={() => setCampaignOffset(Math.max(0, campaignOffset - pageSize))} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={!campaignPagination || campaignOffset + pageSize >= campaignPagination.total} onClick={() => setCampaignOffset(campaignOffset + pageSize)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
        </section>
      )}
    </div>
  );
}
