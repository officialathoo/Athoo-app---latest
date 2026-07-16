import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, FilePlus2, Loader2, Pencil, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { DataTable } from "@/components/ui/DataTable";

interface PolicyDocument {
  id: string;
  slug: string;
  title: string;
  titleUr?: string | null;
  summary?: string | null;
  summaryUr?: string | null;
  bodyEn: string;
  bodyUr?: string | null;
  version: string;
  audience: "all" | "customer" | "provider";
  requiresAcceptance?: boolean | null;
  isPublished?: boolean | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

type PolicyForm = Omit<PolicyDocument, "id" | "isPublished" | "publishedAt" | "updatedAt">;
const emptyForm: PolicyForm = { slug: "", title: "", titleUr: "", summary: "", summaryUr: "", bodyEn: "", bodyUr: "", version: "1.0", audience: "all", requiresAcceptance: false };

export function PolicyGovernancePage() {
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const canWrite = hasPermission("settings.write");
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [legalVersion, setLegalVersion] = useState("1.0");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PolicyDocument | null>(null);
  const [form, setForm] = useState<PolicyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const publishedCount = useMemo(() => policies.filter((policy) => policy.isPublished).length, [policies]);

  async function load() {
    setLoading(true);
    try {
      const response = await api<{ policies: PolicyDocument[]; legalVersion: string }>("/api/admin/policies");
      setPolicies(response.policies);
      setLegalVersion(response.legalVersion);
    } catch (error) {
      toast({ title: "Could not load policies", description: (error as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function open(policy?: PolicyDocument) {
    setSelected(policy || null);
    setForm(policy ? { slug: policy.slug, title: policy.title, titleUr: policy.titleUr || "", summary: policy.summary || "", summaryUr: policy.summaryUr || "", bodyEn: policy.bodyEn, bodyUr: policy.bodyUr || "", version: policy.version, audience: policy.audience, requiresAcceptance: Boolean(policy.requiresAcceptance) } : emptyForm);
  }

  async function save() {
    if (!form.slug.trim() || !form.title.trim() || form.bodyEn.trim().length < 40) {
      toast({ title: "Policy details incomplete", description: "Slug, title, and at least 40 characters of English content are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api(selected ? `/api/admin/policies/${selected.id}` : "/api/admin/policies", { method: selected ? "PATCH" : "POST", body: form });
      toast({ title: selected ? "Policy draft updated" : "Policy draft created", description: "Changed policies remain unpublished until they are reviewed and published." });
      setSelected(null); setForm(emptyForm); await load();
    } catch (error) {
      toast({ title: "Policy could not be saved", description: (error as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function setPublished(policy: PolicyDocument, publish: boolean) {
    if (publish && !window.confirm(`Publish ${policy.title} version ${policy.version}? This becomes visible in the mobile app.`)) return;
    setSaving(true);
    try {
      await api(`/api/admin/policies/${policy.id}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
      toast({ title: publish ? "Policy published" : "Policy unpublished" });
      await load();
    } catch (error) {
      toast({ title: "Publication action failed", description: (error as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Governance" title="Policy Center" description="Maintain bilingual, versioned policies for customers and providers. Updates are audited and automatically unpublished until reviewed." actions={<><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"><RefreshCw size={15} /> Refresh</button>{canWrite ? <button type="button" onClick={() => open()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><FilePlus2 size={15} /> New policy</button> : null}</>} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documents</p><p className="mt-1 text-2xl font-bold text-slate-950">{policies.length}</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Published</p><p className="mt-1 text-2xl font-bold text-emerald-800">{publishedCount}</p></div><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Required acceptance version</p><p className="mt-1 text-2xl font-bold text-blue-800">{legalVersion}</p></div></div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex gap-3"><ShieldCheck size={20} className="shrink-0" aria-hidden="true" /><div><p className="font-semibold">Governance safeguard</p><p className="mt-1 text-xs leading-5">Privacy and Terms may require acceptance only when their version matches the application legal version. Obtain appropriate legal review before changing required-acceptance wording for launch.</p></div></div></div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><DataTable caption="Athoo policy documents" data={policies} loading={loading} keyExtractor={(policy) => policy.id} emptyMessage="No policies configured" columns={[
        { header: "Policy", render: (policy) => <div><p className="font-semibold text-slate-900">{policy.title}</p><p className="text-xs text-slate-500">/{policy.slug} · v{policy.version}</p></div> },
        { header: "Audience", render: (policy) => <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{policy.audience}</span> },
        { header: "Acceptance", render: (policy) => <span className="text-xs text-slate-600">{policy.requiresAcceptance ? "Required" : "Informational"}</span> },
        { header: "Status", render: (policy) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${policy.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{policy.isPublished ? "Published" : "Draft"}</span> },
        { header: "Actions", render: (policy) => <div className="flex flex-wrap gap-2"><button type="button" onClick={() => open(policy)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-blue-700" aria-label={`Edit ${policy.title}`}><Pencil size={13} /> Edit</button>{canWrite ? <button type="button" disabled={saving} onClick={() => void setPublished(policy, !policy.isPublished)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${policy.isPublished ? "border border-slate-200 text-slate-700" : "bg-emerald-600 text-white"}`}>{policy.isPublished ? <X size={13} /> : <Send size={13} />}{policy.isPublished ? "Unpublish" : "Publish"}</button> : null}</div> },
      ]} /></div>

      {(selected || form.slug || form.title) ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="policy-editor-title"><div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white p-5"><div><h2 id="policy-editor-title" className="text-lg font-semibold text-slate-950">{selected ? `Edit ${selected.title}` : "Create policy draft"}</h2><p className="mt-1 text-xs text-slate-500">Saving changes unpublishes the document until reviewed.</p></div><button type="button" onClick={() => { setSelected(null); setForm(emptyForm); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close policy editor"><X size={18} /></button></div><div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Slug<input value={form.slug} disabled={Boolean(selected)} onChange={(event) => setForm((value) => ({ ...value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal disabled:bg-slate-100" /></label><label className="text-sm font-semibold text-slate-700">Version<input value={form.version} onChange={(event) => setForm((value) => ({ ...value, version: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><label className="text-sm font-semibold text-slate-700">English title<input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><label className="text-sm font-semibold text-slate-700">Urdu title<input dir="rtl" value={form.titleUr || ""} onChange={(event) => setForm((value) => ({ ...value, titleUr: event.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><label className="text-sm font-semibold text-slate-700">Audience<select value={form.audience} onChange={(event) => setForm((value) => ({ ...value, audience: event.target.value as PolicyForm["audience"] }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-normal"><option value="all">All users</option><option value="customer">Customers</option><option value="provider">Providers</option></select></label><label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(form.requiresAcceptance)} onChange={(event) => setForm((value) => ({ ...value, requiresAcceptance: event.target.checked }))} /> Requires account acceptance</label><label className="text-sm font-semibold text-slate-700 md:col-span-2">English summary<textarea value={form.summary || ""} onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label><label className="text-sm font-semibold text-slate-700 md:col-span-2">Urdu summary<textarea dir="rtl" value={form.summaryUr || ""} onChange={(event) => setForm((value) => ({ ...value, summaryUr: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label><label className="text-sm font-semibold text-slate-700 md:col-span-2">English content<textarea value={form.bodyEn} onChange={(event) => setForm((value) => ({ ...value, bodyEn: event.target.value }))} rows={10} className="mt-1 w-full rounded-lg border p-3 font-normal leading-6" /></label><label className="text-sm font-semibold text-slate-700 md:col-span-2">Urdu content<textarea dir="rtl" value={form.bodyUr || ""} onChange={(event) => setForm((value) => ({ ...value, bodyUr: event.target.value }))} rows={10} className="mt-1 w-full rounded-lg border p-3 font-normal leading-7" /></label></div><div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><button type="button" onClick={() => { setSelected(null); setForm(emptyForm); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>{canWrite ? <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Save draft</button> : null}</div></div></div> : null}
    </div>
  );
}
