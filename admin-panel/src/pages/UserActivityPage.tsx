import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, Shield, Activity, FileText,
  Bell, MessageSquare, Receipt, CreditCard, Star, Radio, History, Loader2,
  AlertCircle, CheckCircle, Copy, Wallet, Ban, Briefcase, Siren, Lock,
  Unlock, UserX, UserCheck, LogOut, Megaphone, Scale, Gavel, TrendingUp,
  ExternalLink, Save, X, Clock,
} from "lucide-react";
import { api, currency, formatDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type TabKey =
  | "overview" | "profile" | "bookings" | "negotiations" | "invoices" | "commissions"
  | "withdrawals" | "refunds" | "complaints" | "reportsFiled" | "reportsAgainst"
  | "reviews" | "notifications" | "broadcasts" | "logins" | "documents" | "chats"
  | "audit" | "rateRequests";

interface ActivityResp {
  user: any;
  stats: Record<string, number>;
  bookings: any[];
  negotiations: any[];
  notifications: any[];
  complaints: any[];
  reviewsGiven: any[];
  reviewsReceived: any[];
  invoices: any[];
  commissions: any[];
  withdrawals: any[];
  refunds: any[];
  loginHistory: any[];
  broadcasts: any[];
  documents: any[];
  reportsFiled?: any[];
  reportsAgainst?: any[];
  auditTrail?: any[];
  rateRequests?: any[];
  chats?: any[];
  capabilities?: { bookings: boolean; finance: boolean; support: boolean; audit: boolean };
}

type ReasonAction = "block" | "unblock" | "deactivate" | "reactivate" | null;

function docExpiryState(d: any): { label: string; cls: string } {
  if (!d?.expiresAt || d?.expiryNotApplicable) return { label: d?.expiryNotApplicable ? "No expiry" : "No expiry date", cls: "bg-slate-100 text-slate-500" };
  const days = Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, cls: "bg-red-100 text-red-700" };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: "bg-amber-100 text-amber-700" };
  return { label: `Valid until ${formatDate(d.expiresAt)}`, cls: "bg-emerald-50 text-emerald-700" };
}

export function UserActivityPage() {
  const [, params] = useRoute<{ id: string }>("/users/:id/activity");
  const userId = params?.id;
  const { toast } = useToast();
  const [data, setData] = useState<ActivityResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortNewest, setSortNewest] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Actions
  const [reasonAction, setReasonAction] = useState<ReasonAction>(null);
  const [reasonText, setReasonText] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnKind, setWarnKind] = useState<"warning" | "notice">("warning");
  const [warnMessage, setWarnMessage] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true); setErr(null);
    api<ActivityResp>(`/api/admin/users/${userId}/activity`)
      .then((d) => {
        setData(d);
        setNotesDraft(d.user?.adminNotes || "");
        setNotesDirty(false);
        setLimitDraft(d.user?.commissionLimit != null ? String(d.user.commissionLimit) : "");
      })
      .catch((e) => setErr((e as Error).message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(load, [load]);

  function copyId(id: string) {
    navigator.clipboard.writeText(id).then(() => toast({ title: "Copied", description: id }));
  }

  async function runAction(method: string, path: string, body?: any, successMsg?: string) {
    setBusyAction(true);
    try {
      await api(`/api/admin${path}`, { method, body: body ? JSON.stringify(body) : undefined });
      toast({ title: successMsg || "Done" });
      setReasonAction(null);
      setReasonText("");
      setWarnOpen(false);
      setWarnMessage("");
      load();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyAction(false);
    }
  }

  const filteredBookings = useMemo(() => {
    if (!data) return [];
    let list = [...data.bookings];
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    if (dateFrom) list = list.filter((b) => new Date(b.createdAt).getTime() >= new Date(dateFrom).getTime());
    if (dateTo) list = list.filter((b) => new Date(b.createdAt).getTime() <= new Date(dateTo).getTime() + 86400000);
    list.sort((a, b) => sortNewest
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  }, [data, statusFilter, dateFrom, dateTo, sortNewest]);

  if (loading && !data) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (err && !data) return <ErrorCard message={err} />;
  if (!data) return <ErrorCard message="No data" />;

  const u = data.user;
  const isProvider = u.role === "provider";
  const s = data.stats;
  const caps = data.capabilities || { bookings: true, finance: true, support: true, audit: true };

  const tabs: { key: TabKey; label: string; icon: any; count?: number; show?: boolean }[] = ([
    { key: "overview", label: "Overview", icon: Activity },
    { key: "profile", label: "Full profile", icon: User },
    { key: "bookings", label: isProvider ? "Jobs" : "Bookings", icon: Calendar, count: s.totalBookings, show: caps.bookings },
    { key: "negotiations", label: "Offers", icon: MessageSquare, count: s.offersSubmitted, show: caps.bookings },
    { key: "broadcasts", label: "Broadcasts", icon: Radio, count: data.broadcasts.length, show: !isProvider && caps.bookings },
    { key: "documents", label: "Documents", icon: FileText, count: s.documentsCount ?? data.documents.length },
    { key: "complaints", label: "Tickets", icon: AlertCircle, count: s.complaints, show: caps.support },
    { key: "reportsAgainst", label: "Complaints against", icon: Gavel, count: s.reportsAgainst ?? 0, show: caps.support },
    { key: "reportsFiled", label: "Reports filed", icon: Scale, count: s.reportsFiled ?? 0, show: caps.support },
    { key: "reviews", label: "Reviews", icon: Star, count: data.reviewsGiven.length + data.reviewsReceived.length },
    { key: "invoices", label: "Invoices", icon: Receipt, count: data.invoices.length, show: caps.finance },
    { key: "commissions", label: "Earnings paid", icon: Wallet, count: data.commissions.length, show: isProvider && caps.finance },
    { key: "withdrawals", label: "Withdrawals", icon: CreditCard, count: data.withdrawals.length, show: isProvider && caps.finance },
    { key: "refunds", label: "Refunds", icon: Ban, count: data.refunds.length, show: !isProvider && caps.finance },
    { key: "rateRequests", label: "Rate requests", icon: TrendingUp, count: data.rateRequests?.length ?? 0, show: isProvider },
    { key: "chats", label: "Chats", icon: MessageSquare, count: data.chats?.length ?? 0, show: caps.support },
    { key: "notifications", label: "Notifications", icon: Bell, count: s.notifications },
    { key: "logins", label: "Logins", icon: History, count: data.loginHistory.length, show: caps.audit },
    { key: "audit", label: "Audit trail", icon: Siren, count: data.auditTrail?.length ?? 0, show: caps.audit },
  ] as { key: TabKey; label: string; icon: any; count?: number; show?: boolean }[]).filter((t) => t.show === undefined || t.show);

  const reasonCopy: Record<Exclude<ReasonAction, null>, { title: string; placeholder: string; cta: string; endpoint: string }> = {
    block: { title: `Block ${u.name} [${u.publicId || u.id}]`, placeholder: "Reason shown to the user (min 3 chars)", cta: "Block account", endpoint: `/users/${userId}/block` },
    unblock: { title: `Unblock ${u.name} [${u.publicId || u.id}]`, placeholder: "Reason shown to the user (min 3 chars)", cta: "Unblock account", endpoint: `/users/${userId}/unblock` },
    deactivate: { title: `Deactivate ${u.name} [${u.publicId || u.id}]`, placeholder: "Reason shown to the user (min 3 chars)", cta: "Deactivate", endpoint: `/users/${userId}/deactivate` },
    reactivate: { title: `Reactivate ${u.name} [${u.publicId || u.id}]`, placeholder: "Reason logged for audit (min 3 chars)", cta: "Reactivate", endpoint: `/users/${userId}/reactivate` },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/users" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{u.name || "(no name)"}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${u.role === "provider" ? "bg-blue-50 text-blue-700" : u.role === "admin" ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"}`}>{u.role}</span>
              {u.publicId && (
                <button onClick={() => copyId(u.publicId)} title="Stable public ID — survives name changes" className="text-[11px] font-mono bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:bg-blue-100 flex items-center gap-1">
                  <Copy size={10} /> {u.publicId}
                </button>
              )}
              <button onClick={() => copyId(u.id)} title="Internal record ID" className="text-[10px] text-slate-400 font-mono hover:text-slate-700 flex items-center gap-1">
                <Copy size={9} /> #{String(u.id).slice(-8)}
              </button>
              {u.isBlocked && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">BLOCKED</span>}
              {u.isDeactivated && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">DEACTIVATED</span>}
              {isProvider && u.verificationStatus && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${u.verificationStatus === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{String(u.verificationStatus).toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setWarnOpen(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100">
            <Megaphone size={13} /> Warn / Notice
          </button>
          {isProvider && !u.isBlocked && (
            <button onClick={() => setReasonAction("block")} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
              <Lock size={13} /> Block
            </button>
          )}
          {isProvider && u.isBlocked && (
            <button onClick={() => setReasonAction("unblock")} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
              <Unlock size={13} /> Unblock
            </button>
          )}
          {!u.isDeactivated ? (
            <button onClick={() => setReasonAction("deactivate")} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
              <UserX size={13} /> Deactivate
            </button>
          ) : (
            <button onClick={() => setReasonAction("reactivate")} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
              <UserCheck size={13} /> Reactivate
            </button>
          )}
          <button onClick={() => runAction("POST", `/users/${userId}/revoke-sessions`, undefined, "Sessions revoked")} disabled={busyAction} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-50">
            <LogOut size={13} /> Revoke sessions
          </button>
        </div>
      </div>

      {/* Identity card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Field icon={Phone} label="Phone" value={u.phone} />
        <Field icon={Mail} label="Email" value={u.email || "—"} />
        <Field icon={MapPin} label="Location" value={u.location || "—"} />
        <Field icon={Calendar} label="Joined" value={u.joinedAt ? formatDate(u.joinedAt) : "—"} />
        <Field icon={Shield} label="Account status" value={u.isDeactivated ? "Deactivated" : u.isBlocked ? "Blocked" : "Active"} valueClass={u.isDeactivated || u.isBlocked ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"} />
        {isProvider && <Field icon={CheckCircle} label="Verification" value={u.verificationStatus || "—"} valueClass={u.verificationStatus === "approved" ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"} />}
        {isProvider && <><Field icon={Briefcase} label="Services" value={Array.isArray(u.services) ? u.services.join(", ") : (u.services || "—")} /><Field icon={Wallet} label="Hourly rate / Pending commission" value={`Rs. ${u.hourlyRate ?? "—"}`} /></>}
        {!isProvider && <Field icon={Star} label="Rating" value={u.rating != null ? `${Number(u.rating).toFixed(1)} / 5` : "—"} />}
        {(s.reportsAgainst ?? 0) > 0 && <Field icon={Gavel} label="Open complaints against" value={`${s.openReportsAgainst ?? 0} open / ${s.reportsAgainst} total`} valueClass={(s.openReportsAgainst ?? 0) > 0 ? "text-red-600 font-semibold" : ""} />}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label={isProvider ? "Total jobs" : "Total bookings"} value={s.totalBookings} />
        <Stat label="Active" value={s.active} accent="text-blue-600" />
        <Stat label="Completed" value={s.completed} accent="text-emerald-600" />
        <Stat label="Cancelled" value={s.cancelled} accent="text-red-600" />
        <Stat label={isProvider ? "Gross earnings" : "Total spend"} value={currency(s.totalAmount ?? 0)} />
        {isProvider
          ? <Stat label="Commission paid" value={currency(s.commissionPaidTotal ?? 0)} accent="text-purple-600" />
          : <Stat label="Refund requests" value={data.refunds.length} accent="text-purple-600" />}
      </div>
      {isProvider && (s.documentsCount > 0 || s.pendingDocuments > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Documents on file" value={s.documentsCount ?? 0} />
          <Stat label="Pending review" value={s.pendingDocuments ?? 0} accent={(s.pendingDocuments ?? 0) > 0 ? "text-amber-600" : "text-slate-400"} />
          <Stat label="Expired docs" value={s.expiredDocuments ?? 0} accent={(s.expiredDocuments ?? 0) > 0 ? "text-red-600" : "text-emerald-600"} />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {tabs.map((t) => {
            const Ico = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap flex items-center gap-1.5 border-b-2 ${active ? "border-blue-600 text-blue-700 bg-blue-50/40" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                <Ico size={14} /> {t.label} {t.count !== undefined && t.count > 0 && <span className="text-[10px] text-slate-400">({t.count})</span>}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Section title="Admin notes (internal)">
                  <textarea value={notesDraft} onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }} rows={4} placeholder="Internal context about this user…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <button onClick={() => runAction("PATCH", `/users/${userId}/notes`, { notes: notesDraft }, "Notes saved")} disabled={!notesDirty || busyAction} className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                    <Save size={12} /> Save notes
                  </button>
                </Section>
                {isProvider && (
                  <Section title="Commission limit (auto-block threshold)">
                    <input type="number" min={100} value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. 5000" />
                    <button onClick={() => runAction("PATCH", `/users/${userId}/commission-limit`, { commissionLimit: Number(limitDraft) }, "Commission limit updated")} disabled={!limitDraft || busyAction} className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                      <Save size={12} /> Update limit
                    </button>
                  </Section>
                )}
              </div>
              <Section title="Recent jobs"><ListBookings items={data.bookings.slice(0, 5)} onCopy={copyId} /></Section>
              {(data.auditTrail?.length ?? 0) > 0 && (
                <Section title="Latest audit events">
                  <ListGeneric items={data.auditTrail!.slice(0, 6)} renderRow={(a: any) => (
                    <Row key={a.id} title={a.action} subtitle={`by ${a.adminName}${a.details ? ` · ${JSON.stringify(a.details).slice(0, 120)}` : ""}`} id={a.targetId || a.id} createdAt={a.createdAt} onCopy={copyId} />
                  )} empty="" />
                </Section>
              )}
            </div>
          )}

          {tab === "profile" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
              {Object.entries(u)
                .filter(([k]) => !["id"].includes(k))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <Field key={k} icon={Dot} label={k} value={
                    v == null ? "—"
                    : typeof v === "object" ? JSON.stringify(v)
                    : typeof v === "boolean" ? (v ? "Yes" : "No")
                    : k.toLowerCase().includes("at") && !isNaN(Date.parse(String(v))) ? formatDate(String(v))
                    : String(v)
                  } />
                ))}
            </div>
          )}

          {tab === "bookings" && (
            <div className="space-y-3">
              <Filters statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                statusOptions={["all", "pending", "accepted", "in_progress", "completed", "cancelled"]}
                sortNewest={sortNewest} setSortNewest={setSortNewest}
                dateFrom={dateFrom} setDateFrom={setDateFrom}
                dateTo={dateTo} setDateTo={setDateTo} />
              <ListBookings items={filteredBookings} onCopy={copyId} />
            </div>
          )}

          {tab === "negotiations" && <ListGeneric items={data.negotiations} renderRow={(n: any) => (
            <Row key={n.id} title={`${n.service || "(no service)"}`} subtitle={`Customer offer: Rs. ${n.customerOffer ?? "—"} · Provider counter: Rs. ${n.providerCounter ?? "—"} · Final: Rs. ${n.finalPrice ?? "—"}`} status={n.status} id={n.id} createdAt={n.createdAt} onCopy={copyId} />
          )} empty="No offers" />}

          {tab === "broadcasts" && <ListGeneric items={data.broadcasts} renderRow={(b: any) => (
            <Row key={b.id} title={b.service} subtitle={b.address || "—"} status={b.status} id={b.id} createdAt={b.createdAt} onCopy={copyId} />
          )} empty="No broadcast requests" />}

          {tab === "documents" && (isProvider ? (
            <ListGeneric items={data.documents} renderRow={(d: any) => {
              const ex = docExpiryState(d);
              return (
                <div key={d.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 capitalize">{String(d.type || "document").replace(/_/g, " ")}</p>
                    <p className="text-xs text-slate-500 truncate">{d.label || d.url}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${ex.cls}`}><Clock size={9} className="inline mr-0.5" />{ex.label}</span>
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${d.status === "approved" ? "bg-emerald-50 text-emerald-700" : d.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{d.status}</span>
                      {d.rejectionNote && <span className="text-[10px] text-red-500 truncate max-w-[220px]">Rejected: {d.rejectionNote}</span>}
                      <button onClick={() => copyId(d.id)} className="text-[10px] text-slate-400 hover:text-slate-700 font-mono flex items-center gap-1"><Copy size={9} />#{String(d.id).slice(-8)}</button>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"><ExternalLink size={12} /> Open</a>}
                    <p className="text-[10px] text-slate-400">{formatDate(d.createdAt)}</p>
                    {d.reviewedAt && <p className="text-[10px] text-slate-400">Reviewed {formatDate(d.reviewedAt)}</p>}
                  </div>
                </div>
              );
            }} empty="No documents uploaded" />
          ) : <p className="text-sm text-slate-400 py-6 text-center">Documents are collected for provider accounts.</p>)}

          {tab === "complaints" && <ListGeneric items={data.complaints} renderRow={(c: any) => (
            <Row key={c.id} title={c.subject || "(no subject)"} subtitle={c.message?.slice(0, 120) || ""} status={c.status} id={c.id} createdAt={c.createdAt} onCopy={copyId} />
          )} empty="No support tickets" />}

          {tab === "reportsAgainst" && <ListGeneric items={data.reportsAgainst || []} renderRow={(r: any) => (
            <Row key={r.id} title={`${r.category} — reported by ${r.reporterName || "?"} (#${String(r.reporterId || "").slice(-8)})`} subtitle={r.description?.slice(0, 140) || r.adminNote || ""} status={r.status || "open"} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
          )} empty="No complaints filed against this user" />}

          {tab === "reportsFiled" && <ListGeneric items={data.reportsFiled || []} renderRow={(r: any) => (
            <Row key={r.id} title={`${r.category} — against ${r.reportedName || "?"} (#${String(r.reportedId || "").slice(-8)})`} subtitle={r.description?.slice(0, 140) || ""} status={r.status || "open"} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
          )} empty="This user has not reported anyone" />}

          {tab === "reviews" && (
            <div className="space-y-4">
              <Section title={`Reviews received (${data.reviewsReceived.length})`}>
                <ListGeneric items={data.reviewsReceived} renderRow={(r: any) => (
                  <Row key={r.id} title={`${"⭐".repeat(r.rating ?? 0)} (${r.rating}/5) — by ${r.reviewerName || ""}`} subtitle={r.review || ""} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
                )} empty="No reviews received" />
              </Section>
              <Section title={`Reviews given (${data.reviewsGiven.length})`}>
                <ListGeneric items={data.reviewsGiven} renderRow={(r: any) => (
                  <Row key={r.id} title={`${"⭐".repeat(r.rating ?? 0)} (${r.rating}/5) — for ${r.reviewedName || ""}`} subtitle={r.review || ""} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
                )} empty="No reviews given" />
              </Section>
            </div>
          )}

          {tab === "invoices" && <ListGeneric items={data.invoices} renderRow={(i: any) => (
            <Row key={i.id} title={`${i.invoiceNumber || ""} · Rs. ${i.totalAmount ?? "—"}`} subtitle={`Booking ${i.bookingPublicId || i.bookingId || "—"} · ${i.service ?? ""}`} status={i.status} id={i.id} createdAt={i.createdAt} onCopy={copyId} />
          )} empty="No invoices" />}

          {tab === "commissions" && <ListGeneric items={data.commissions} renderRow={(c: any) => (
            <Row key={c.id} title={`Rs. ${c.amount ?? 0}`} subtitle={`Account: ${c.accountId || "—"} · Ref: ${c.reference || ""}`} status={c.status} id={c.id} createdAt={c.createdAt} onCopy={copyId} />
          )} empty="No commission payments" />}

          {tab === "withdrawals" && <ListGeneric items={data.withdrawals} renderRow={(w: any) => (
            <Row key={w.id} title={`Rs. ${w.amount ?? 0}`} subtitle={`${w.bankName || ""} · ${w.accountTitle || ""} · ${w.accountNumber || ""}`} status={w.status} id={w.id} createdAt={w.createdAt} onCopy={copyId} />
          )} empty="No withdrawal requests" />}

          {tab === "refunds" && <ListGeneric items={data.refunds} renderRow={(r: any) => (
            <Row key={r.id} title={`Rs. ${r.amountRequested ?? 0}`} subtitle={r.reason || "—"} status={r.status} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
          )} empty="No refund requests" />}

          {tab === "rateRequests" && <ListGeneric items={data.rateRequests || []} renderRow={(r: any) => (
            <Row key={r.id} title={`${r.service}: Rs. ${r.currentRate ?? "—"} → Rs. ${r.requestedRate}`} subtitle={r.reviewNote || r.reason || ""} status={r.status} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
          )} empty="No hourly-rate change requests" />}

          {tab === "chats" && <ListGeneric items={data.chats || []} renderRow={(c: any) => {
            const other = c.participant1Id === userId ? c.participant2Name : c.participant1Name;
            const otherId = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
            return (
              <Row key={c.id} title={`Chat with ${other}`} subtitle={`${c.service || "Direct"}${c.bookingId ? ` · Booking #${String(c.bookingId).slice(-8)}` : ""}`} status={c.isLocked ? "locked" : "open"} id={otherId} createdAt={c.createdAt} onCopy={copyId} />
            );
          }} empty="No chat history" />}

          {tab === "notifications" && <ListGeneric items={data.notifications} renderRow={(n: any) => (
            <Row key={n.id} title={n.title} subtitle={n.body} status={n.isRead ? "read" : "unread"} id={n.id} createdAt={n.createdAt} onCopy={copyId} />
          )} empty="No notifications" />}

          {tab === "logins" && <ListGeneric items={data.loginHistory} renderRow={(l: any) => (
            <Row key={l.id} title={l.ipAddress || "—"} subtitle={l.userAgent || ""} status={l.success === false ? "failed" : "success"} id={l.id} createdAt={l.createdAt} onCopy={copyId} />
          )} empty="No login history" />}

          {tab === "audit" && <ListGeneric items={data.auditTrail || []} renderRow={(a: any) => (
            <Row key={a.id} title={a.action} subtitle={`${a.adminName || "system"} → ${a.target || "user"} ${a.targetId ? `#${String(a.targetId).slice(-8)}` : ""}${a.details ? ` · ${JSON.stringify(a.details).slice(0, 140)}` : ""}`} id={a.targetId || a.id} createdAt={a.createdAt} onCopy={copyId} />
          )} empty="No audit events reference this user yet" />}
        </div>
      </div>

      {/* Reason modal (block/unblock/deactivate/reactivate) */}
      {reasonAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReasonAction(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 capitalize">{reasonAction} account</h2>
              <button onClick={() => setReasonAction(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{reasonCopy[reasonAction].placeholder}</label>
              <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <p className="text-xs text-slate-400 mt-1.5">Target identity: <strong>{u.name}</strong> · stable ID <span className="font-mono">{u.publicId || u.id}</span> (recorded in audit log)</p>
            </div>
            <div className="p-5 pt-0 border-t-0 flex justify-end gap-2">
              <button onClick={() => setReasonAction(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={() => runAction("PATCH", reasonCopy[reasonAction].endpoint, { reason: reasonText }, reasonCopy[reasonAction].cta)}
                disabled={busyAction || reasonText.trim().length < 3}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {busyAction ? "Working…" : reasonCopy[reasonAction].cta}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warn / Notice modal */}
      {warnOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setWarnOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Issue warning or notice</h2>
              <button onClick={() => setWarnOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                <select value={warnKind} onChange={(e) => setWarnKind(e.target.value as any)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="warning">Warning (formal)</option>
                  <option value="notice">Notice (informational)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message (pushed to the user's app)</label>
                <textarea value={warnMessage} onChange={(e) => setWarnMessage(e.target.value)} rows={4} maxLength={1000} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <p className="text-xs text-slate-400">Recipient: <strong>{u.name}</strong> · stable ID <span className="font-mono">{u.publicId || u.id}</span>. Delivered as an in-app notification + push, and recorded in the audit log.</p>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-2">
              <button onClick={() => setWarnOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={() => runAction("POST", `/users/${userId}/warn`, { kind: warnKind, message: warnMessage }, `${warnKind === "warning" ? "Warning" : "Notice"} delivered`)}
                disabled={busyAction || !warnMessage.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {busyAction ? "Sending…" : "Deliver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dot() { return null; }

function Field({ icon: Icon, label, value, valueClass = "text-slate-800" }: any) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5 break-all">
        {Icon ? <Icon size={11} /> : null} {label}
      </div>
      <p className={`text-sm ${valueClass} break-words`} title={typeof value === "string" ? value : undefined}>{value}</p>
    </div>
  );
}

function Stat({ label, value, accent = "text-slate-900" }: { label: string; value: any; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className={`text-lg font-bold ${accent} mt-0.5`}>{value}</p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700 flex items-center gap-2">
      <AlertCircle size={16} /> {message}
    </div>
  );
}

function Filters({ statusFilter, setStatusFilter, statusOptions, sortNewest, setSortNewest, dateFrom, setDateFrom, dateTo, setDateTo }: any) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
        {statusOptions.map((s: string) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</option>)}
      </select>
      <button onClick={() => setSortNewest(!sortNewest)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white hover:bg-slate-50">
        {sortNewest ? "Newest first ↓" : "Oldest first ↑"}
      </button>
      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white" />
      <span className="text-xs text-slate-400">to</span>
      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white" />
    </div>
  );
}

function ListBookings({ items, onCopy }: { items: any[]; onCopy: (id: string) => void }) {
  if (!items || items.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">No bookings found.</p>;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((b) => (
        <div key={b.id} className="py-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 truncate">{b.service}</p>
            <p className="text-xs text-slate-500 truncate">{b.customerName} → {b.providerName || "Unassigned"} · {b.address || "—"}</p>
            <button onClick={() => onCopy(b.publicId || b.id)} className="text-[10px] text-slate-400 hover:text-slate-700 font-mono mt-0.5 flex items-center gap-1"><Copy size={9} /> {b.publicId || b.id}</button>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-slate-800">Rs. {b.price ?? 0}</p>
            <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full ${
              b.status === "completed" ? "bg-emerald-50 text-emerald-700" :
              b.status === "cancelled" ? "bg-red-50 text-red-700" :
              "bg-slate-100 text-slate-600"
            }`}>{b.status}</span>
            <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(b.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListGeneric({ items, renderRow, empty }: { items: any[]; renderRow: (it: any) => React.ReactNode; empty: string }) {
  if (!items || items.length === 0) return empty ? <p className="text-sm text-slate-400 py-6 text-center">{empty}</p> : null;
  return <div className="divide-y divide-slate-100">{items.map(renderRow)}</div>;
}

function Row({ title, subtitle, status, id, createdAt, onCopy }: any) {
  return (
    <div className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 line-clamp-2">{subtitle}</p>}
        {id && <button onClick={() => onCopy(id)} className="text-[10px] text-slate-400 hover:text-slate-700 font-mono mt-0.5 flex items-center gap-1"><Copy size={9} /> {String(id).startsWith("#") ? id : `#${String(id).slice(-8)}`}</button>}
      </div>
      <div className="text-right shrink-0">
        {status && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{String(status).replace(/_/g, " ")}</span>}
        {createdAt && <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(createdAt)}</p>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}
