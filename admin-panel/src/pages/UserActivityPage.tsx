import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, Shield, Activity, FileText,
  Bell, MessageSquare, Receipt, CreditCard, Star, Radio, History, Loader2,
  AlertCircle, CheckCircle, Copy, Wallet, Ban, Briefcase,
} from "lucide-react";
import { api, currency, formatDate } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type TabKey =
  | "overview" | "bookings" | "negotiations" | "invoices" | "commissions"
  | "withdrawals" | "refunds" | "complaints" | "reviews" | "notifications"
  | "broadcasts" | "logins" | "documents" | "chats" | "calls";

interface ActivityResp {
  user: any;
  stats: {
    totalBookings: number; active: number; completed: number; cancelled: number;
    totalAmount: number; offersSubmitted: number; offersAccepted: number;
    offersRejected: number; notifications: number; complaints: number;
  };
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
  chats?: any[];
  calls?: any[];
  deepTimeline?: any[];
  auditDepth?: { captured: string[]; note: string };
  capabilities?: { bookings: boolean; finance: boolean; support: boolean; audit: boolean };
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

  useEffect(() => {
    if (!userId) return;
    setLoading(true); setErr(null);
    api<ActivityResp>(`/api/admin/customers/${userId}/activity`)
      .then(setData)
      .catch((e) => setErr((e as Error).message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [userId]);

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

  function copyId(id: string) {
    navigator.clipboard.writeText(id).then(() => toast({ title: "Copied", description: id }));
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (err) return <ErrorCard message={err} />;
  if (!data) return <ErrorCard message="No data" />;

  const u = data.user;
  const isProvider = false;
  const caps = data.capabilities || { bookings: false, finance: false, support: false, audit: false };

  const tabs: { key: TabKey; label: string; icon: any; count?: number; show?: boolean }[] = ([
    { key: "overview", label: "Overview", icon: Activity },
    { key: "bookings", label: "Bookings", icon: Calendar, count: data.stats.totalBookings, show: caps.bookings },
    { key: "negotiations", label: "Offers", icon: MessageSquare, count: data.stats.offersSubmitted, show: caps.bookings },
    { key: "invoices", label: "Invoices", icon: Receipt, count: data.invoices.length, show: caps.finance },
    { key: "commissions", label: "Commissions", icon: Wallet, count: data.commissions.length, show: isProvider },
    { key: "withdrawals", label: "Withdrawals", icon: CreditCard, count: data.withdrawals.length, show: isProvider },
    { key: "refunds", label: "Refunds", icon: Ban, count: data.refunds.length, show: caps.finance },
    { key: "broadcasts", label: "Broadcasts", icon: Radio, count: data.broadcasts.length, show: !isProvider },
    { key: "complaints", label: "Complaints", icon: AlertCircle, count: data.complaints.length, show: caps.support },
    { key: "reviews", label: "Reviews", icon: Star, count: (data.reviewsGiven.length + data.reviewsReceived.length) },
    { key: "notifications", label: "Notifications", icon: Bell, count: data.notifications.length },
    { key: "logins", label: "Login history", icon: History, count: data.loginHistory.length, show: caps.audit },
    { key: "documents", label: "Documents", icon: FileText, count: 0, show: false },
    { key: "chats", label: "Chats", icon: MessageSquare, count: data.chats?.length || 0, show: caps.support },
    { key: "calls", label: "Calls", icon: Phone, count: data.calls?.length || 0, show: caps.support },
  ] as { key: TabKey; label: string; icon: any; count?: number; show?: boolean }[]).filter((t) => t.show === undefined || t.show);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/users" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{u.name || "(no name)"}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${u.role === "provider" ? "bg-blue-50 text-blue-700" : u.role === "admin" ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"}`}>{u.role}</span>
              <button onClick={() => copyId(u.id)} className="text-[11px] text-slate-500 font-mono hover:text-slate-800 flex items-center gap-1">
                <Copy size={11} /> {u.id}
              </button>
            </div>
          </div>
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
        {isProvider && <Field icon={Briefcase} label="Services" value={Array.isArray(u.services) ? u.services.join(", ") : (u.services || "—")} />}
        {isProvider && <Field icon={Wallet} label="Pending commission" value={`Rs. ${u.pendingCommission ?? 0}`} />}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label={isProvider ? "Total jobs" : "Total bookings"} value={data.stats.totalBookings} />
        <Stat label="Active" value={data.stats.active} accent="text-blue-600" />
        <Stat label="Completed" value={data.stats.completed} accent="text-emerald-600" />
        <Stat label="Cancelled" value={data.stats.cancelled} accent="text-red-600" />
        <Stat label="Total amount" value={currency(data.stats.totalAmount)} />
      </div>

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
                <Ico size={14} /> {t.label} {t.count !== undefined && <span className="text-[10px] text-slate-400">({t.count})</span>}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === "overview" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Recent activity</h3>
              <ListBookings items={data.bookings.slice(0, 5)} onCopy={copyId} />
              {data.deepTimeline && data.deepTimeline.length > 0 && (
                <Section title="Deep activity timeline">
                  <ListGeneric items={data.deepTimeline.slice(0, 12)} renderRow={(x: any) => (
                    <Row key={`${x.type}-${x.id}`} title={`${x.type}: ${x.title}`} subtitle={JSON.stringify({ status: x.status, id: x.id }).slice(0, 160)} status={x.status} id={x.id} createdAt={x.createdAt} onCopy={copyId} />
                  )} empty="No deep activity found" />
                </Section>
              )}
              <p className="text-xs text-slate-400">Switch tabs above to drill into each area. Raw booking, complaint, invoice, login, document, and notification rows are preserved for audit depth.</p>
            </div>
          )}

          {tab === "bookings" && (
            <div className="space-y-3">
              <Filters
                statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                statusOptions={["all", "pending", "accepted", "in_progress", "completed", "cancelled"]}
                sortNewest={sortNewest} setSortNewest={setSortNewest}
                dateFrom={dateFrom} setDateFrom={setDateFrom}
                dateTo={dateTo} setDateTo={setDateTo}
              />
              <ListBookings items={filteredBookings} onCopy={copyId} />
            </div>
          )}

          {tab === "negotiations" && <ListGeneric items={data.negotiations} renderRow={(n: any) => (
            <Row key={n.id} title={`${n.service || "(no service)"}`} subtitle={`Customer offer: Rs. ${n.customerOffer ?? "—"} · Provider counter: Rs. ${n.providerCounter ?? "—"} · Final: Rs. ${n.finalPrice ?? "—"}`} status={n.status} id={n.id} createdAt={n.createdAt} onCopy={copyId} />
          )} empty="No offers" />}

          {tab === "invoices" && <ListGeneric items={data.invoices} renderRow={(i: any) => (
            <Row key={i.id} title={`${i.invoiceNumber || ""} · Rs. ${i.totalAmount ?? "—"}`} subtitle={`Booking ${i.bookingId ?? "—"} · ${i.service ?? ""}`} status={i.status} id={i.id} createdAt={i.createdAt} onCopy={copyId} />
          )} empty="No invoices" />}

          {tab === "commissions" && <ListGeneric items={data.commissions} renderRow={(c: any) => (
            <Row key={c.id} title={`Rs. ${c.amount ?? 0}`} subtitle={`Account: ${c.accountId || "—"} · Ref: ${c.reference || ""}`} status={c.status} id={c.id} createdAt={c.createdAt} onCopy={copyId} />
          )} empty="No commission payments" />}

          {tab === "withdrawals" && <ListGeneric items={data.withdrawals} renderRow={(w: any) => (
            <Row key={w.id} title={`Rs. ${w.amount ?? 0}`} subtitle={`${w.bankName || ""} · ${w.accountTitle || ""} · ${w.accountNumber || ""}`} status={w.status} id={w.id} createdAt={w.createdAt} onCopy={copyId} />
          )} empty="No withdrawals" />}

          {tab === "refunds" && <ListGeneric items={data.refunds} renderRow={(r: any) => (
            <Row key={r.id} title={`Rs. ${r.amountRequested ?? 0}`} subtitle={r.reason || "—"} status={r.status} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
          )} empty="No refund requests" />}

          {tab === "broadcasts" && <ListGeneric items={data.broadcasts} renderRow={(b: any) => (
            <Row key={b.id} title={b.service} subtitle={b.address || "—"} status={b.status} id={b.id} createdAt={b.createdAt} onCopy={copyId} />
          )} empty="No broadcast requests" />}

          {tab === "complaints" && <ListGeneric items={data.complaints} renderRow={(c: any) => (
            <Row key={c.id} title={c.subject || "(no subject)"} subtitle={c.message?.slice(0, 100) || ""} status={c.status} id={c.id} createdAt={c.createdAt} onCopy={copyId} />
          )} empty="No complaints" />}

          {tab === "reviews" && (
            <div className="space-y-4">
              <Section title="Reviews received">
                <ListGeneric items={data.reviewsReceived} renderRow={(r: any) => (
                  <Row key={r.id} title={`${"⭐".repeat(r.rating ?? 0)} (${r.rating}/5) — by ${r.reviewerName || ""}`} subtitle={r.review || ""} status={undefined} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
                )} empty="No reviews received" />
              </Section>
              <Section title="Reviews given">
                <ListGeneric items={data.reviewsGiven} renderRow={(r: any) => (
                  <Row key={r.id} title={`${"⭐".repeat(r.rating ?? 0)} (${r.rating}/5) — for ${r.reviewedName || ""}`} subtitle={r.review || ""} status={undefined} id={r.id} createdAt={r.createdAt} onCopy={copyId} />
                )} empty="No reviews given" />
              </Section>
            </div>
          )}

          {tab === "notifications" && <ListGeneric items={data.notifications} renderRow={(n: any) => (
            <Row key={n.id} title={n.title} subtitle={n.body} status={n.isRead ? "read" : "unread"} id={n.id} createdAt={n.createdAt} onCopy={copyId} />
          )} empty="No notifications" />}

          {tab === "logins" && <ListGeneric items={data.loginHistory} renderRow={(l: any) => (
            <Row key={l.id} title={l.ipAddress || "—"} subtitle={l.userAgent || ""} status={l.success === false ? "failed" : "success"} id={l.id} createdAt={l.createdAt} onCopy={copyId} />
          )} empty="No login history" />}

          {tab === "documents" && <ListGeneric items={data.documents} renderRow={(d: any) => (
            <Row key={d.id} title={d.type || "Document"} subtitle={d.label || d.url || ""} status={d.status} id={d.id} createdAt={d.createdAt} onCopy={copyId} />
          )} empty="No documents uploaded" />}

          {tab === "chats" && <ListGeneric items={data.chats || []} renderRow={(c: any) => (
            <Row key={c.id} title={c.service || "Chat"} subtitle={c.last_message || c.lastMessage || "No recent message"} status={c.booking_id || c.bookingId ? "booking linked" : "direct"} id={c.id} createdAt={c.last_message_at || c.lastMessageAt || c.created_at || c.createdAt} onCopy={copyId} />
          )} empty="No chat history" />}

          {tab === "calls" && <ListGeneric items={data.calls || []} renderRow={(c: any) => (
            <Row key={c.id} title={c.service || "Voice call"} subtitle={`${c.caller_id || c.callerId || ""} → ${c.receiver_id || c.receiverId || ""}`} status={c.status} id={c.id} createdAt={c.created_at || c.createdAt} onCopy={copyId} />
          )} empty="No call history" />}
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value, valueClass = "text-slate-800" }: any) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">
        <Icon size={11} /> {label}
      </div>
      <p className={`text-sm ${valueClass} truncate`}>{value}</p>
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
        {statusOptions.map((s: string) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
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
  if (!items || items.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">{empty}</p>;
  return <div className="divide-y divide-slate-100">{items.map(renderRow)}</div>;
}

function Row({ title, subtitle, status, id, createdAt, onCopy }: any) {
  return (
    <div className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        {id && <button onClick={() => onCopy(id)} className="text-[10px] text-slate-400 hover:text-slate-700 font-mono mt-0.5 flex items-center gap-1"><Copy size={9} /> {id}</button>}
      </div>
      <div className="text-right shrink-0">
        {status && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{status}</span>}
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
