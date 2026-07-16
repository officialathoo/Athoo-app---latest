import { useEffect, useRef, useState } from "react";
import { Search, X, User, Calendar, FileText, Bell, MessageSquare, Radio, Receipt, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { NotificationBell } from "@/components/NotificationBell";
import { api } from "@/lib/api";

const PAGE_TITLES: Record<string, [string, string]> = {
  "/": ["Dashboard", "Live overview of users, bookings, revenue, and platform health"],
  "/users": ["Users", "Manage customer and provider accounts"],
  "/providers": ["Providers", "Control dues, commission limits, verification, and account status"],
  "/bookings": ["Bookings", "Track jobs, status flow, and platform revenue"],
  "/negotiations": ["Negotiations", "Review active offers and resolve stuck negotiations"],
  "/verification": ["Verification", "Review and approve provider verification requests"],
  "/requests": ["Broadcast Requests", "Open broadcast jobs from customers seeking providers"],
  "/live-jobs": ["Live Jobs Monitor", "Real-time view of active and in-progress bookings"],
  "/finance": ["Finance", "Platform revenue, provider dues, and commission analytics"],
  "/commission": ["Commission Payments", "Track and manage provider commission dues"],
  "/withdrawals": ["Withdrawals", "Review and process provider wallet withdrawal requests"],
  "/refunds": ["Refunds", "Process customer refund requests and disputes"],
  "/payment-accounts": ["Payment Accounts", "Manage provider payout bank and mobile wallet accounts"],
  "/broadcasts": ["Broadcasts", "Send platform-wide notices to customers, providers, or everyone"],
  "/marketing": ["Banners & Announcements", "Manage home screen banners and popup announcements"],
  "/promotions": ["Promotions", "Manage discount codes and promotional campaigns"],
  "/faqs": ["Help & FAQs", "Manage FAQ content shown to customers and providers"],
  "/complaints": ["Complaints & Support", "Manage support tickets and resolve customer/provider issues"],
  "/chat-moderation": ["Chat Moderation", "Review booking conversations and apply safety locks"],
  "/reported-issues": ["Reported Issues", "Review and action in-app content and behavior reports"],
  "/rate-requests": ["Rate Requests", "Provider requests to update their hourly or service rates"],
  "/categories": ["Service Categories", "Configure available service types and categories"],
  "/plans": ["Premium Plans", "Define subscription plans for customers and providers"],
  "/emergency-contacts": ["Emergency Contacts", "Manage emergency contact numbers shown in the app"],
  "/notification-templates": ["Notification Templates", "Edit automated push, SMS, and email message templates"],
  "/email-center": ["Email Delivery Center", "Configure, test, audit, and manage portable email delivery"],
  "/reports": ["Reports & Analytics", "Platform-wide performance metrics and CSV exports"],
  "/audit-log": ["Audit Log", "Complete history of all admin actions for accountability"],
  "/login-history": ["Login History", "Security log of all admin authentication events"],
  "/admin-users": ["Admin Users", "Manage admin accounts, roles, and permission sets"],
  "/settings": ["Settings", "Configure commission rates and platform rules"],
};

interface HeaderProps {
  pathname: string;
}

interface SearchResults {
  users: any[];
  bookings: any[];
  negotiations: any[];
  invoices: any[];
  notifications: any[];
  complaints: any[];
  broadcasts: any[];
}

const EMPTY_RESULTS: SearchResults = {
  users: [], bookings: [], negotiations: [], invoices: [], notifications: [], complaints: [], broadcasts: [],
};

export function Header({ pathname }: HeaderProps) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const key = pathname.replace(base, "") || "/";
  const [title, subtitle] = PAGE_TITLES[key] || ["Admin Panel", "Athoo Operations Hub"];

  const [, navigate] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api<{ results: SearchResults }>(`/api/admin/search`, { params: { q: query.trim() } });
        setResults(data.results || EMPTY_RESULTS);
      } catch {
        setResults(EMPTY_RESULTS);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Keyboard shortcut: Ctrl/Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setSearchOpen(false);
    setQuery("");
    setResults(EMPTY_RESULTS);
  }

  function go(path: string) {
    close();
    navigate(path);
  }

  const totalCount =
    results.users.length + results.bookings.length + results.negotiations.length +
    results.invoices.length + results.notifications.length + results.complaints.length +
    results.broadcasts.length;

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 hidden sm:block">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-slate-500 text-sm transition-colors"
            data-testid="header-search-btn"
          >
            <Search size={15} />
            <span className="hidden md:inline">Search anything…</span>
            <kbd className="hidden md:inline-block ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded text-slate-400">Ctrl K</kbd>
          </button>
          <NotificationBell />
        </div>
      </header>

      {searchOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4" onClick={close}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 border-b border-slate-100">
              {loading ? <Loader2 size={18} className="text-slate-400 animate-spin" /> : <Search size={18} className="text-slate-400" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by ID, phone, email, name, address, service…"
                className="flex-1 outline-none text-sm bg-transparent placeholder:text-slate-400"
                data-testid="global-search-input"
              />
              <button onClick={close} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {query.trim().length < 2 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  <Search size={28} className="mx-auto mb-2 text-slate-300" />
                  Type at least 2 characters to search.
                  <p className="mt-1 text-xs">Search across users, bookings, offers, invoices, complaints, notifications, and broadcasts.</p>
                </div>
              ) : totalCount === 0 && !loading ? (
                <div className="p-8 text-center text-sm text-slate-400">No results for &quot;{query}&quot;</div>
              ) : (
                <div className="py-2">
                  <ResultGroup icon={<User size={14} />} label="Users & Providers" items={results.users} render={(u: any) => (
                    <button key={u.id} onClick={() => go(`/users/${u.id}/activity`)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3" data-testid="search-result-user">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{u.name || "(no name)"} <span className="text-xs text-slate-400 font-normal">{u.role}</span></p>
                        <p className="text-xs text-slate-500 truncate">{u.phone} {u.email ? `· ${u.email}` : ""}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{u.id}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.isBlocked || u.isDeactivated ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                        {u.isDeactivated ? "Deactivated" : u.isBlocked ? "Blocked" : "Active"}
                      </span>
                    </button>
                  )} />
                  <ResultGroup icon={<Calendar size={14} />} label="Bookings" items={results.bookings} render={(b: any) => (
                    <button key={b.id} onClick={() => go(`/bookings`)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800 truncate">{b.service}</p>
                      <p className="text-xs text-slate-500 truncate">{b.customerName} → {b.providerName || "Unassigned"} · Rs. {b.price ?? 0}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{b.publicId || b.id} · {b.status}</p>
                    </button>
                  )} />
                  <ResultGroup icon={<MessageSquare size={14} />} label="Offers / Negotiations" items={results.negotiations} render={(n: any) => (
                    <div key={n.id} className="px-4 py-2.5 hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800 truncate">{n.service || "(no service)"} · {n.status}</p>
                      <p className="text-xs text-slate-500 truncate">Customer offer: Rs. {n.customerOffer ?? "—"} · Provider counter: Rs. {n.providerCounter ?? "—"}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{n.id}</p>
                    </div>
                  )} />
                  <ResultGroup icon={<Receipt size={14} />} label="Invoices" items={results.invoices} render={(i: any) => (
                    <div key={i.id} className="px-4 py-2.5 hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800">Rs. {i.totalAmount ?? "—"} · {i.status}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{i.id}</p>
                    </div>
                  )} />
                  <ResultGroup icon={<Bell size={14} />} label="Notifications" items={results.notifications} render={(n: any) => (
                    <div key={n.id} className="px-4 py-2.5 hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                      <p className="text-xs text-slate-500 truncate">{n.body}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{n.id} · {n.type}</p>
                    </div>
                  )} />
                  <ResultGroup icon={<FileText size={14} />} label="Complaints / Tickets" items={results.complaints} render={(c: any) => (
                    <button key={c.id} onClick={() => go(`/complaints`)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.subject || "(no subject)"}</p>
                      <p className="text-xs text-slate-500 truncate">{c.message}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{c.id} · {c.status}</p>
                    </button>
                  )} />
                  <ResultGroup icon={<Radio size={14} />} label="Broadcasts" items={results.broadcasts} render={(b: any) => (
                    <button key={b.id} onClick={() => go(`/requests`)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-800 truncate">{b.service}</p>
                      <p className="text-xs text-slate-500 truncate">{b.address}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{b.id} · {b.status}</p>
                    </button>
                  )} />
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Press <kbd className="px-1 py-0.5 bg-slate-100 rounded font-mono">Esc</kbd> to close</span>
              {totalCount > 0 && <span>{totalCount} results</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({ icon, label, items, render }: { icon: React.ReactNode; label: string; items: any[]; render: (it: any) => React.ReactNode }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 flex items-center gap-1.5">
        {icon} {label} <span className="text-slate-300">· {items.length}</span>
      </div>
      {items.map(render)}
    </div>
  );
}
