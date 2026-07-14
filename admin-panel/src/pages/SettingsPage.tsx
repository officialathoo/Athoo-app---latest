import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import type { PlatformSettings } from "@/lib/types";
import {
  Save, Loader2, CheckCircle, AlertCircle, Globe,
  Phone, DollarSign, Users, Clock, Shield, AlertTriangle,
  Megaphone, MessageSquare, Crown, Slash, Mail,
} from "lucide-react";

function TestEmailButton() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function handleTest() {
    setState("loading"); setMsg("");
    try {
      const r = await api<{ ok: boolean; channel: string; to: string }>("/api/admin/settings/test-email", { method: "POST" });
      if (r.ok) { setState("ok"); setMsg(`Test email sent to ${r.to} via ${r.channel}`); }
      else { setState("error"); setMsg("SMTP configured but send failed. Check server logs."); }
    } catch (e: any) {
      setState("error"); setMsg(e?.message || "Failed to send test email");
    }
    setTimeout(() => setState("idle"), 5000);
  }
  return (
    <div className="flex items-center gap-3 mt-2">
      <button type="button" onClick={handleTest} disabled={state === "loading"}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
        {state === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        {state === "loading" ? "Sending…" : "Send Test Email"}
      </button>
      {state === "ok" && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={13} />{msg}</span>}
      {state === "error" && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={13} />{msg}</span>}
    </div>
  );
}

type Form = {
  commissionRate: string;
  defaultCommissionLimit: string;
  platformName: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultVisitCharge: string;
  maxBookingsPerDay: string;
  appVersion: string;
  minBookingNoticeHours: string;
  allowGuestBrowsing: boolean;
  providerAutoApprove: boolean;
  bookingCancellationWindowHours: string;
  broadcastTTLMinutes: string;
  broadcastInitialRadiusKm: string;
  broadcastExpansionRadiusKm: string;
  broadcastExpandAfterMinutes: string;
  maxNegotiationRounds: string;
  premiumCommissionDiscountPercent: string;
  premiumPriorityBoost: boolean;
  premiumProfileBadgeEnabled: boolean;
  defaultServiceRadiusKm: string;
  customerCancellationFee: string;
  providerCancellationPenalty: string;
};

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/70">
        <div className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
          <Icon size={15} className="text-slate-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}

function TInput({ value, onChange, placeholder, prefix, suffix, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  prefix?: string; suffix?: string; type?: string;
}) {
  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-sm text-slate-400 pointer-events-none select-none">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${prefix ? "pl-10" : "pl-3"} ${suffix ? "pr-12" : "pr-3"}`}
      />
      {suffix && <span className="absolute right-3 text-sm text-slate-400 pointer-events-none select-none">{suffix}</span>}
    </div>
  );
}

function Toggle({ value, onChange, onLabel = "On", offLabel = "Off" }: {
  value: boolean; onChange: (v: boolean) => void; onLabel?: string; offLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 mt-1">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? "bg-blue-600" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className={`text-sm font-medium ${value ? "text-blue-700" : "text-slate-500"}`}>{value ? onLabel : offLabel}</span>
    </div>
  );
}

export function SettingsPage() {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canWrite = hasPermission("settings.write");
  const canTestEmail = isSuperAdmin();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<Form>({
    commissionRate: "10",
    defaultCommissionLimit: "5000",
    platformName: "Athoo",
    supportPhone: "+92 339 0051068",
    supportEmail: "support@athoo.pk",
    maintenanceMode: false,
    defaultVisitCharge: "200",
    maxBookingsPerDay: "10",
    appVersion: "1.0.0",
    minBookingNoticeHours: "1",
    allowGuestBrowsing: true,
    providerAutoApprove: false,
    bookingCancellationWindowHours: "1",
    broadcastTTLMinutes: "30",
    broadcastInitialRadiusKm: "30",
    broadcastExpansionRadiusKm: "50",
    broadcastExpandAfterMinutes: "5",
    maxNegotiationRounds: "3",
    premiumCommissionDiscountPercent: "0",
    premiumPriorityBoost: true,
    premiumProfileBadgeEnabled: true,
    defaultServiceRadiusKm: "25",
    customerCancellationFee: "0",
    providerCancellationPenalty: "0",
  });

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ settings: PlatformSettings }>("/api/admin/settings");
      const s = res.settings;
      setSettings(s);
      setForm({
        commissionRate: String(s.commissionRate),
        defaultCommissionLimit: String(s.defaultCommissionLimit),
        platformName: s.platformName || "Athoo",
        supportPhone: s.supportPhone || "+92 339 0051068",
        supportEmail: s.supportEmail || "support@athoo.pk",
        maintenanceMode: Boolean(s.maintenanceMode),
        defaultVisitCharge: String(s.defaultVisitCharge ?? 200),
        maxBookingsPerDay: String(s.maxBookingsPerDay ?? 10),
        appVersion: s.appVersion || "1.0.0",
        minBookingNoticeHours: String(s.minBookingNoticeHours ?? 1),
        allowGuestBrowsing: s.allowGuestBrowsing !== false,
        providerAutoApprove: Boolean(s.providerAutoApprove),
        bookingCancellationWindowHours: String(s.bookingCancellationWindowHours ?? 1),
        broadcastTTLMinutes: String(s.broadcastTTLMinutes ?? 30),
        broadcastInitialRadiusKm: String(s.broadcastInitialRadiusKm ?? 30),
        broadcastExpansionRadiusKm: String(s.broadcastExpansionRadiusKm ?? 50),
        broadcastExpandAfterMinutes: String(s.broadcastExpandAfterMinutes ?? 5),
        maxNegotiationRounds: String(s.maxNegotiationRounds ?? 3),
        premiumCommissionDiscountPercent: String(s.premiumCommissionDiscountPercent ?? 0),
        premiumPriorityBoost: s.premiumPriorityBoost !== false,
        premiumProfileBadgeEnabled: s.premiumProfileBadgeEnabled !== false,
        defaultServiceRadiusKm: String(s.defaultServiceRadiusKm ?? 25),
        customerCancellationFee: String(s.customerCancellationFee ?? 0),
        providerCancellationPenalty: String(s.providerCancellationPenalty ?? 0),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(form.commissionRate);
    const limit = Number(form.defaultCommissionLimit);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setError("Commission rate must be 0–100."); return; }
    if (!Number.isFinite(limit) || limit < 100) { setError("Commission limit must be at least Rs. 100."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          commissionRate: rate,
          defaultCommissionLimit: limit,
          platformName: form.platformName.trim(),
          supportPhone: form.supportPhone.trim(),
          supportEmail: form.supportEmail.trim(),
          maintenanceMode: form.maintenanceMode,
          defaultVisitCharge: Number(form.defaultVisitCharge),
          maxBookingsPerDay: Number(form.maxBookingsPerDay),
          appVersion: form.appVersion.trim(),
          minBookingNoticeHours: Number(form.minBookingNoticeHours),
          allowGuestBrowsing: form.allowGuestBrowsing,
          providerAutoApprove: form.providerAutoApprove,
          bookingCancellationWindowHours: Number(form.bookingCancellationWindowHours),
          broadcastTTLMinutes: Number(form.broadcastTTLMinutes),
          broadcastInitialRadiusKm: Number(form.broadcastInitialRadiusKm),
          broadcastExpansionRadiusKm: Number(form.broadcastExpansionRadiusKm),
          broadcastExpandAfterMinutes: Number(form.broadcastExpandAfterMinutes),
          maxNegotiationRounds: Number(form.maxNegotiationRounds),
          premiumCommissionDiscountPercent: Number(form.premiumCommissionDiscountPercent),
          premiumPriorityBoost: form.premiumPriorityBoost,
          premiumProfileBadgeEnabled: form.premiumProfileBadgeEnabled,
          defaultServiceRadiusKm: Number(form.defaultServiceRadiusKm),
          customerCancellationFee: Number(form.customerCancellationFee),
          providerCancellationPenalty: Number(form.providerCancellationPenalty),
        }),
      });
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        <span className="text-sm">Loading settings...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Platform Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure all operational parameters for {settings?.platformName || "Athoo"}</p>
          {!canWrite && <p className="text-xs text-amber-700 mt-1">Read-only access. Settings changes require settings.write.</p>}
        </div>
        <button
          type="submit"
          disabled={saving || !canWrite}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shadow-sm"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving..." : "Save All"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} className="shrink-0" /> All settings saved successfully.
        </div>
      )}

      {form.maintenanceMode && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Maintenance Mode is Active</p>
            <p className="text-xs text-amber-700 mt-0.5">New bookings are blocked app-wide. Existing jobs can still be completed.</p>
          </div>
        </div>
      )}

      <Section title="Platform Identity" icon={Globe}>
        <Field label="Platform Name" hint="Shown in app headers, communications, and emails.">
          <TInput value={form.platformName} onChange={v => set("platformName", v)} placeholder="Athoo" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="App Version" hint="Current production release.">
            <TInput value={form.appVersion} onChange={v => set("appVersion", v)} placeholder="1.0.0" />
          </Field>
          <Field label="Maintenance Mode" hint="Immediately blocks all new bookings.">
            <Toggle
              value={form.maintenanceMode}
              onChange={v => set("maintenanceMode", v)}
              onLabel="Active — app paused"
              offLabel="Off — app live"
            />
          </Field>
        </div>
      </Section>

      <Section title="Commission & Finance" icon={DollarSign}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Commission Rate" hint={`Deducted from each completed job. Currently ${settings?.commissionRate ?? 0}%.`}>
            <TInput value={form.commissionRate} onChange={v => set("commissionRate", v)} type="number" suffix="%" />
          </Field>
          <Field label="Commission Due Limit (Rs.)" hint="Providers blocked when dues exceed this.">
            <TInput value={form.defaultCommissionLimit} onChange={v => set("defaultCommissionLimit", v)} type="number" prefix="Rs." />
          </Field>
        </div>
      </Section>

      <Section title="Booking Rules" icon={Clock}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum Booking Notice" hint="Earliest booking a customer can place.">
            <TInput value={form.minBookingNoticeHours} onChange={v => set("minBookingNoticeHours", v)} type="number" suffix="hours" />
          </Field>
          <Field label="Free Cancellation Window" hint="Customer can cancel free within this period.">
            <TInput value={form.bookingCancellationWindowHours} onChange={v => set("bookingCancellationWindowHours", v)} type="number" suffix="hours" />
          </Field>
        </div>
        <Field label="Max Bookings Per Day (per provider)" hint="Guards against overbooking individual providers.">
          <TInput value={form.maxBookingsPerDay} onChange={v => set("maxBookingsPerDay", v)} type="number" suffix="jobs/day" />
        </Field>
      </Section>

      <Section title="Provider Controls" icon={Users}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Auto-Approve New Providers" hint="Skip KYC manual review — not recommended for production.">
            <Toggle
              value={form.providerAutoApprove}
              onChange={v => set("providerAutoApprove", v)}
              onLabel="On — auto-approve"
              offLabel="Off — manual review"
            />
          </Field>
          <Field label="Guest Browsing" hint="Allow unauthenticated users to browse service listings.">
            <Toggle
              value={form.allowGuestBrowsing}
              onChange={v => set("allowGuestBrowsing", v)}
              onLabel="On — public access"
              offLabel="Off — login required"
            />
          </Field>
        </div>
      </Section>

      <Section title="Support Contact" icon={Phone}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Support Phone" hint="Displayed in customer Help & FAQs screen.">
            <TInput value={form.supportPhone} onChange={v => set("supportPhone", v)} placeholder="+92 300 0000000" />
          </Field>
          <Field label="Support Email" hint="For escalations and formal complaints.">
            <TInput value={form.supportEmail} onChange={v => set("supportEmail", v)} placeholder="support@athoo.pk" type="email" />
          </Field>
        </div>
        {canTestEmail && <TestEmailButton />}
      </Section>

      <Section title="Broadcast & Service Area" icon={Megaphone}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Broadcast TTL" hint="Total minutes a broadcast request stays open before expiring.">
            <TInput value={form.broadcastTTLMinutes} onChange={v => set("broadcastTTLMinutes", v)} type="number" suffix="minutes" />
          </Field>
          <Field label="Default Service Radius" hint="Default search radius when no custom area is set for a provider.">
            <TInput value={form.defaultServiceRadiusKm} onChange={v => set("defaultServiceRadiusKm", v)} type="number" suffix="km" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Initial Broadcast Radius" hint="Providers within this distance are notified immediately.">
            <TInput value={form.broadcastInitialRadiusKm} onChange={v => set("broadcastInitialRadiusKm", v)} type="number" suffix="km" />
          </Field>
          <Field label="Expanded Broadcast Radius" hint="Radius used after the expand timer fires.">
            <TInput value={form.broadcastExpansionRadiusKm} onChange={v => set("broadcastExpansionRadiusKm", v)} type="number" suffix="km" />
          </Field>
          <Field label="Expand After" hint="Minutes after creation before radius expands.">
            <TInput value={form.broadcastExpandAfterMinutes} onChange={v => set("broadcastExpandAfterMinutes", v)} type="number" suffix="min" />
          </Field>
        </div>
      </Section>

      <Section title="Negotiation" icon={MessageSquare}>
        <Field label="Max Negotiation Rounds" hint="Maximum counter-offers allowed before a broadcast expires. Minimum 1.">
          <TInput value={form.maxNegotiationRounds} onChange={v => set("maxNegotiationRounds", v)} type="number" suffix="rounds" />
        </Field>
      </Section>

      <Section title="Premium Membership" icon={Crown}>
        <Field label="Commission Discount for Premium Providers" hint="Percentage deducted from the commission rate for active premium providers. Set 0 to disable.">
          <TInput value={form.premiumCommissionDiscountPercent} onChange={v => set("premiumCommissionDiscountPercent", v)} type="number" suffix="%" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority Boost in Search" hint="Premium providers appear higher in customer search results.">
            <Toggle
              value={form.premiumPriorityBoost}
              onChange={v => set("premiumPriorityBoost", v)}
              onLabel="On — boosted"
              offLabel="Off — same rank"
            />
          </Field>
          <Field label="Show Premium Badge" hint="Display a Crown badge on premium provider profiles.">
            <Toggle
              value={form.premiumProfileBadgeEnabled}
              onChange={v => set("premiumProfileBadgeEnabled", v)}
              onLabel="Badge visible"
              offLabel="Badge hidden"
            />
          </Field>
        </div>
      </Section>

      <Section title="Cancellation Fees" icon={Slash}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer Late Cancellation Fee (Rs.)" hint="Charged when a customer cancels after the free window expires. Set 0 to disable.">
            <TInput value={form.customerCancellationFee} onChange={v => set("customerCancellationFee", v)} type="number" prefix="Rs." />
          </Field>
          <Field label="Provider Rejection Penalty (Rs.)" hint="Deducted from provider when they reject or abandon an accepted job. Set 0 to disable.">
            <TInput value={form.providerCancellationPenalty} onChange={v => set("providerCancellationPenalty", v)} type="number" prefix="Rs." />
          </Field>
        </div>
      </Section>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield size={13} /> How commission works
        </h4>
        <div className="space-y-2 text-sm text-slate-600">
          <p>When a booking is completed, the platform deducts the commission rate from the job price. Providers accumulate pending dues which they must pay to Athoo.</p>
          <p>Once pending dues reach the commission due limit, the provider is automatically blocked from receiving new bookings until they clear their balance.</p>
          <p>Admins can manually mark individual providers as paid from the Finance or Providers pages.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !canWrite}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors text-sm shadow-sm"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </form>
  );
}
