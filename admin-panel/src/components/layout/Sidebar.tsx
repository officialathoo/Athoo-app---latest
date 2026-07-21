import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, UserCog, ClipboardList, ShieldCheck,
  Wallet, Megaphone, Settings, LogOut, Menu, X,
  MessageSquareWarning, MessageCircle, Star, BarChart2, ScrollText, Tag, Shield,
  Crown, Headphones, DollarSign, Settings2,
  LayoutGrid, Building2, Receipt, Inbox, RotateCcw, ArrowUpFromLine,
  Image, Bell, MapPin, HelpCircle, ChevronDown, ChevronRight,
  Briefcase, Zap, Globe, Flag, TrendingUp, Phone, History, Ban, FileText,
  UserPlus, Mail, BookOpenCheck,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { adminRealtime } from "@/lib/adminRealtime";
import type { AdminUser, SidebarCounts } from "@/lib/types";
import { hasAdminUiPermission } from "@/lib/permissions";

// ─── Navigation structure ─────────────────────────────────────────────────────
interface NavItem {
  to: string;
  label: string;
  icon: any;
  exact?: boolean;
  perm?: string;
  superAdminOnly?: boolean;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  perm?: string;
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    label: "Operations",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/operations-inbox", label: "Operations Inbox", icon: Inbox, perm: "dashboard.read" },
      { to: "/live-jobs", label: "Live Jobs", icon: Zap, perm: "operations.read" },
      { to: "/users", label: "Users", icon: Users, perm: "users.read" },
      { to: "/inactive-accounts", label: "Inactive Accounts", icon: History, perm: "users.read" },
      { to: "/providers", label: "Providers", icon: UserCog, perm: "users.read" },
      { to: "/bookings", label: "Bookings", icon: ClipboardList, perm: "operations.read" },
      { to: "/negotiations", label: "Negotiations", icon: MessageCircle, perm: "operations.read" },
      { to: "/verification", label: "Verification", icon: ShieldCheck, perm: "verification.write" },
      { to: "/document-renewals", label: "Document Renewals", icon: FileText, perm: "verification.write" },
      { to: "/requests", label: "Requests", icon: Inbox, perm: "operations.read" },
      { to: "/complaints", label: "Complaints", icon: MessageSquareWarning, perm: "complaints.read" },
      { to: "/chat-moderation", label: "Chat Moderation", icon: MessageCircle, perm: "complaints.read" },
      { to: "/reviews", label: "Review Moderation", icon: Star, perm: "complaints.read" },
      { to: "/reported-issues", label: "Reported Issues", icon: Flag, perm: "complaints.write" },
      { to: "/rate-requests", label: "Rate Requests", icon: TrendingUp, perm: "verification.write" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    perm: "finance.read",
    items: [
      { to: "/finance", label: "Finance Overview", icon: Wallet, perm: "finance.read" },
      { to: "/invoices", label: "Invoices", icon: FileText, perm: "finance.read" },
      { to: "/commission", label: "Commission", icon: Receipt, perm: "finance.read" },
      { to: "/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, perm: "finance.write" },
      { to: "/refunds", label: "Refunds", icon: RotateCcw, perm: "finance.write" },
      { to: "/payment-accounts", label: "Payment Accounts", icon: Building2, perm: "finance.read" },
      { to: "/plans?tab=subs&status=pending", label: "Subscription Reviews", icon: Crown, perm: "finance.read" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    perm: "marketing.read",
    items: [
      { to: "/leads", label: "Leads & Waitlist", icon: UserPlus, perm: "users.read" },
      { to: "/marketing", label: "Banners & Popups", icon: Image, perm: "marketing.read" },
      { to: "/broadcasts", label: "Broadcasts", icon: Megaphone, perm: "broadcast.write" },
      { to: "/promotions", label: "Promotions", icon: Tag, perm: "promotions.write" },
      { to: "/faqs", label: "Help & FAQs", icon: HelpCircle, perm: "marketing.read" },
    ],
  },
  {
    id: "config",
    label: "Configuration",
    items: [
      { to: "/categories", label: "Categories", icon: LayoutGrid, perm: "marketing.read" },
      { to: "/service-areas", label: "Service Areas (Cities)", icon: MapPin, perm: "settings.read" },
      { to: "/plans?tab=plans", label: "Premium Plans", icon: Crown, perm: "settings.read" },
      { to: "/emergency-contacts", label: "Emergency Contacts", icon: Phone, perm: "settings.read" },
      { to: "/notification-templates", label: "Notification Templates", icon: Bell, perm: "settings.read" },
      { to: "/email-center", label: "Email Center", icon: Mail, perm: "notifications.read" },
      { to: "/policies", label: "Policy Center", icon: BookOpenCheck, perm: "settings.read" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    perm: "reports.read",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart2, perm: "reports.read" },
      { to: "/audit-log", label: "Audit Log", icon: ScrollText, perm: "audit.read" },
      { to: "/login-history", label: "Login History", icon: History, perm: "audit.read" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    perm: "settings.write",
    items: [
      { to: "/admin-users", label: "Admin Users", icon: Shield, superAdminOnly: true },
      { to: "/blacklist", label: "Blacklist", icon: Ban, superAdminOnly: true },
      { to: "/settings", label: "Settings", icon: Settings, perm: "settings.read" },
    ],
  },
];

const ROLE_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  super_admin: { label: "Super Admin", color: "bg-purple-500/20 text-purple-300 border-purple-500/30", icon: <Crown size={10} /> },
  ops: { label: "Operations", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: <Settings2 size={10} /> },
  finance: { label: "Finance", color: "bg-green-500/20 text-green-300 border-green-500/30", icon: <DollarSign size={10} /> },
  support: { label: "Support", color: "bg-orange-500/20 text-orange-300 border-orange-500/30", icon: <Headphones size={10} /> },
  marketing: { label: "Marketing", color: "bg-pink-500/20 text-pink-300 border-pink-500/30", icon: <Megaphone size={10} /> },
  technical: { label: "Technical", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", icon: <Zap size={10} /> },
};

interface SidebarProps {
  admin: AdminUser | null;
  onLogout: () => void;
}

export function Sidebar({ admin, onLogout }: SidebarProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [sidebarCounts, setSidebarCounts] = useState<SidebarCounts | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await api<{ counts: SidebarCounts }>("/api/admin/sidebar-counts");
      if (res?.counts) setSidebarCounts(res.counts);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    // React instantly to the same realtime stream the notification bell uses,
    // so counters (withdrawals, refunds, verifications, tickets) don't sit
    // stale for up to a minute after an admin action or a new item arrives.
    adminRealtime.connect();
    const off = adminRealtime.on((msg) => {
      if (msg.type === "notification:new" || msg.type === "admin:event") fetchCounts();
    });
    return () => {
      clearInterval(interval);
      off();
    };
  }, [fetchCounts]);

  const countMap: Record<string, number> = {
    "/operations-inbox": (sidebarCounts?.pendingVerifications || 0) + (sidebarCounts?.pendingDocumentRenewals || 0) + (sidebarCounts?.pendingCommissionPayments || 0) + (sidebarCounts?.pendingWithdrawals || 0) + (sidebarCounts?.pendingRefunds || 0) + (sidebarCounts?.openSupportTickets || 0) + (sidebarCounts?.pendingRateRequests || 0) + (sidebarCounts?.pendingSubscriptions || 0) + (sidebarCounts?.pendingServiceRequests || 0) + (sidebarCounts?.pendingDeletionRequests || 0) + (sidebarCounts?.inactiveAccountsForReview || 0) + (sidebarCounts?.openReportedIssues || 0) + (sidebarCounts?.overdueNegotiations || 0) + (sidebarCounts?.unreadNotifications || 0),
    "/verification": sidebarCounts?.pendingVerifications || 0,
    "/document-renewals": sidebarCounts?.pendingDocumentRenewals || 0,
    "/commission": sidebarCounts?.pendingCommissionPayments || 0,
    "/withdrawals": sidebarCounts?.pendingWithdrawals || 0,
    "/refunds": sidebarCounts?.pendingRefunds || 0,
    "/requests": (sidebarCounts?.pendingServiceRequests || 0) + (sidebarCounts?.pendingDeletionRequests || 0),
    "/complaints": sidebarCounts?.openSupportTickets || 0,
    "/rate-requests": sidebarCounts?.pendingRateRequests || 0,
    "/plans?tab=subs&status=pending": sidebarCounts?.pendingSubscriptions || 0,
    "/inactive-accounts": sidebarCounts?.inactiveAccountsForReview || 0,
    "/reported-issues": sidebarCounts?.openReportedIssues || 0,
    "/negotiations": sidebarCounts?.overdueNegotiations || 0,
  };

  const adminRole = admin?.adminRole;
  const isSuperAdmin = adminRole === "super_admin";
  const roleBadge = adminRole ? ROLE_BADGES[adminRole] : null;

  function can(perm?: string) {
    return hasAdminUiPermission(admin, perm);
  }

  function canSeeSection(section: NavSection) {
    if (!section.perm) return true;
    return section.items.some(item => (!item.superAdminOnly || isSuperAdmin) && can(item.perm));
  }

  function isActive(to: string, exact?: boolean) {
    const [targetPath, targetQuery = ""] = to.split("?", 2);
    const adminBase = import.meta.env.BASE_URL.replace(/\/$/, "");
    const fullPath = adminBase + targetPath;
    const pathMatches = exact
      ? location === fullPath || location === targetPath
      : location.startsWith(fullPath) || location.startsWith(targetPath);
    if (!pathMatches || !targetQuery) return pathMatches;
    const expected = new URLSearchParams(targetQuery);
    const current = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    for (const [key, value] of expected.entries()) if (current.get(key) !== value) return false;
    return true;
  }

  function toggleSection(id: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function NavLink({ to, label, icon: Icon, exact }: NavItem) {
    const active = isActive(to, exact);
    const count = countMap[to] || 0;
    return (
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          active
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-300 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Icon size={16} className="shrink-0" />
        <span className="truncate flex-1">{label}</span>
        {count > 0 && (
          <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
            active ? "bg-white/25 text-white" : "bg-orange-500 text-white"
          }`}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    );
  }

  // Preserve nav scroll position across route changes. The sidebar is rendered
  // as stable JSX rather than an inline component type, avoiding a full subtree
  // remount whenever Sidebar rerenders.
  const navScrollRef = useRef<HTMLElement | null>(null);
  const savedScrollTop = useRef(0);

  useEffect(() => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [location]);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-700/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center shrink-0 bg-white rounded-xl overflow-hidden shadow-sm p-0.5">
            <img src="/logo.png" alt="Athoo" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-wide text-white">Athoo Admin</h1>
            <p className="text-xs text-slate-400">Operations Hub</p>
          </div>
        </div>
      </div>

      {/* Admin profile */}
      {admin && (
        <div className="px-3 py-3 mx-3 mt-3 bg-slate-800/60 rounded-xl border border-slate-700/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {admin.name?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{admin.name}</p>
              <p className="text-xs text-slate-400 truncate">{admin.phone || admin.email}</p>
            </div>
          </div>
          {roleBadge && (
            <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 ${roleBadge.color}`}>
              {roleBadge.icon} {roleBadge.label}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav
        ref={(el) => {
          if (el && navScrollRef.current !== el) {
            navScrollRef.current = el;
            el.scrollTop = savedScrollTop.current;
          }
        }}
        onScroll={(e) => { savedScrollTop.current = (e.currentTarget as HTMLElement).scrollTop; }}
        className="flex-1 px-3 py-3 overflow-y-auto space-y-1"
      >
        {NAV_SECTIONS.map(section => {
          if (!canSeeSection(section)) return null;

          const visibleItems = section.items.filter(item => (!item.superAdminOnly || isSuperAdmin) && can(item.perm));
          if (visibleItems.length === 0) return null;

          const isCollapsed = collapsedSections.has(section.id);

          return (
            <div key={section.id} className="mb-1">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={`admin-nav-section-${section.id}`}
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-500 uppercase tracking-wider font-semibold hover:text-slate-300 transition-colors rounded-md"
              >
                <span>{section.label}</span>
                {isCollapsed
                  ? <ChevronRight size={12} />
                  : <ChevronDown size={12} />
                }
              </button>
              {!isCollapsed && (
                <div id={`admin-nav-section-${section.id}`} className="mt-0.5 space-y-0.5">
                  {visibleItems.map(item => (
                    <NavLink key={item.to} {...item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!isSuperAdmin && can("settings.read") && !NAV_SECTIONS.find(s => s.id === "admin" && canSeeSection(s)) && (
          <div className="mt-2 pt-2 border-t border-slate-800">
            <NavLink to="/settings" label="Settings" icon={Settings} perm="settings.read" />
          </div>
        )}
      </nav>

      <div className="px-3 pb-5 mt-auto border-t border-slate-700/60 pt-3 shrink-0">
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-all duration-150"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label={mobileOpen ? "Close admin navigation" : "Open admin navigation"}
        aria-expanded={mobileOpen}
        aria-controls="admin-mobile-sidebar"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-lg shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        id="admin-mobile-sidebar"
        aria-label="Admin navigation"
        className={`fixed top-0 left-0 h-full z-40 w-60 transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:h-screen`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
