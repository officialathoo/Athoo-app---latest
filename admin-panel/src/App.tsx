import { lazy, Suspense } from "react";
import { hasAdminUiPermission } from "@/lib/permissions";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { LoginPage } from "@/pages/LoginPage";
import { useAdmin } from "@/hooks/useAdmin";
import { Loader2, Lock } from "lucide-react";

// Code-split every route, including the chart-heavy dashboard.
// A session downloads only the pages it actually opens.
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const UsersPage = lazy(() => import("@/pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const ProvidersPage = lazy(() => import("@/pages/ProvidersPage").then((m) => ({ default: m.ProvidersPage })));
const NegotiationsPage = lazy(() => import("@/pages/NegotiationsPage").then((m) => ({ default: m.NegotiationsPage })));
const BookingsPage = lazy(() => import("@/pages/BookingsPage").then((m) => ({ default: m.BookingsPage })));
const VerificationPage = lazy(() => import("@/pages/VerificationPage").then((m) => ({ default: m.VerificationPage })));
const FinancePage = lazy(() => import("@/pages/FinancePage").then((m) => ({ default: m.FinancePage })));
const BroadcastsPage = lazy(() => import("@/pages/BroadcastsPage").then((m) => ({ default: m.BroadcastsPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ComplaintsPage = lazy(() => import("@/pages/ComplaintsPage").then((m) => ({ default: m.ComplaintsPage })));
const ChatModerationPage = lazy(() => import("@/pages/ChatModerationPage").then((m) => ({ default: m.ChatModerationPage })));
const ReviewsPage = lazy(() => import("@/pages/ReviewsPage").then((m) => ({ default: m.ReviewsPage })));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const PromotionsPage = lazy(() => import("@/pages/PromotionsPage").then((m) => ({ default: m.PromotionsPage })));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })));
const PaymentAccountsPage = lazy(() => import("@/pages/PaymentAccountsPage").then((m) => ({ default: m.PaymentAccountsPage })));
const CommissionPaymentsPage = lazy(() => import("@/pages/CommissionPaymentsPage").then((m) => ({ default: m.CommissionPaymentsPage })));
const SubscriptionPlansPage = lazy(() => import("@/pages/SubscriptionPlansPage").then((m) => ({ default: m.SubscriptionPlansPage })));
const RequestsPage = lazy(() => import("@/pages/RequestsPage").then((m) => ({ default: m.RequestsPage })));
const WithdrawalsPage = lazy(() => import("@/pages/WithdrawalsPage").then((m) => ({ default: m.WithdrawalsPage })));
const RefundsPage = lazy(() => import("@/pages/RefundsPage").then((m) => ({ default: m.RefundsPage })));
const MarketingPage = lazy(() => import("@/pages/MarketingPage").then((m) => ({ default: m.MarketingPage })));
const FaqsPage = lazy(() => import("@/pages/FaqsPage").then((m) => ({ default: m.FaqsPage })));
const LiveJobsPage = lazy(() => import("@/pages/LiveJobsPage").then((m) => ({ default: m.LiveJobsPage })));
const ReportedIssuesPage = lazy(() => import("@/pages/ReportedIssuesPage").then((m) => ({ default: m.ReportedIssuesPage })));
const RateRequestsPage = lazy(() => import("@/pages/RateRequestsPage").then((m) => ({ default: m.RateRequestsPage })));
const EmergencyContactsPage = lazy(() => import("@/pages/EmergencyContactsPage").then((m) => ({ default: m.EmergencyContactsPage })));
const NotificationTemplatesPage = lazy(() => import("@/pages/NotificationTemplatesPage").then((m) => ({ default: m.NotificationTemplatesPage })));
const LoginHistoryPage = lazy(() => import("@/pages/LoginHistoryPage").then((m) => ({ default: m.LoginHistoryPage })));
const BlacklistPage = lazy(() => import("@/pages/BlacklistPage").then((m) => ({ default: m.BlacklistPage })));
const ServiceAreasPage = lazy(() => import("@/pages/ServiceAreasPage").then((m) => ({ default: m.ServiceAreasPage })));
const UserActivityPage = lazy(() => import("@/pages/UserActivityPage").then((m) => ({ default: m.UserActivityPage })));
const InvoicesPage = lazy(() => import("@/pages/InvoicesPage").then((m) => ({ default: m.InvoicesPage })));
const LeadsPage = lazy(() => import("@/pages/LeadsPage").then((m) => ({ default: m.LeadsPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[40vh]">
      <Loader2 size={24} className="animate-spin text-blue-600" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Lock size={28} className="text-slate-400" />
      </div>
      <h2 className="text-lg font-semibold text-slate-700">Access Restricted</h2>
      <p className="text-sm text-slate-400 mt-1 max-w-xs">
        You don't have permission to view this page. Contact your super admin to request access.
      </p>
    </div>
  );
}

function AppShell() {
  const { token, admin, loading, login, logout } = useAdmin();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!token) {
    return <LoginPage onLogin={login} />;
  }

  function can(perm: string) {
    return hasAdminUiPermission(admin, perm);
  }

  function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
    if (!can(perm)) return <AccessDenied />;
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar admin={admin} onLogout={logout} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header pathname={location} />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<PageFallback />}>
            <Switch>
              <Route path="/" component={DashboardPage} />
              <Route path="/users">
                <Guard perm="users.read"><UsersPage /></Guard>
              </Route>
              <Route path="/users/:id/activity">
                <Guard perm="users.read"><UserActivityPage /></Guard>
              </Route>
              <Route path="/providers">
                <Guard perm="users.read"><ProvidersPage /></Guard>
              </Route>
              <Route path="/bookings">
                <Guard perm="operations.read"><BookingsPage /></Guard>
              </Route>
              <Route path="/negotiations">
                <Guard perm="operations.read"><NegotiationsPage /></Guard>
              </Route>
              <Route path="/verification">
                <Guard perm="verification.write"><VerificationPage /></Guard>
              </Route>
              <Route path="/finance">
                <Guard perm="finance.read"><FinancePage /></Guard>
              </Route>
              <Route path="/commission">
                <Guard perm="finance.read"><CommissionPaymentsPage /></Guard>
              </Route>
              <Route path="/withdrawals">
                <Guard perm="finance.write"><WithdrawalsPage /></Guard>
              </Route>
              <Route path="/refunds">
                <Guard perm="finance.write"><RefundsPage /></Guard>
              </Route>
              <Route path="/requests">
                <Guard perm="operations.read"><RequestsPage /></Guard>
              </Route>
              <Route path="/broadcasts">
                <Guard perm="broadcast.write"><BroadcastsPage /></Guard>
              </Route>
              <Route path="/complaints">
                <Guard perm="support.write"><ComplaintsPage /></Guard>
              </Route>
              <Route path="/chat-moderation">
                <Guard perm="support.read"><ChatModerationPage /></Guard>
              </Route>
              <Route path="/reviews">
                <Guard perm="support.read"><ReviewsPage /></Guard>
              </Route>
              <Route path="/marketing">
                <Guard perm="marketing.read"><MarketingPage /></Guard>
              </Route>
              <Route path="/faqs">
                <Guard perm="marketing.read"><FaqsPage /></Guard>
              </Route>
              <Route path="/promotions">
                <Guard perm="promotions.write"><PromotionsPage /></Guard>
              </Route>
              <Route path="/reports">
                <Guard perm="reports.read"><ReportsPage /></Guard>
              </Route>
              <Route path="/audit-log">
                <Guard perm="audit.read"><AuditLogPage /></Guard>
              </Route>
              <Route path="/categories"><Guard perm="marketing.read"><CategoriesPage /></Guard></Route>
              <Route path="/service-areas"><Guard perm="settings.read"><ServiceAreasPage /></Guard></Route>
              <Route path="/payment-accounts">
                <Guard perm="finance.read"><PaymentAccountsPage /></Guard>
              </Route>
              <Route path="/plans" component={SubscriptionPlansPage} />
              <Route path="/admin-users" component={AdminUsersPage} />
              <Route path="/blacklist" component={BlacklistPage} />
              <Route path="/settings"><Guard perm="settings.read"><SettingsPage /></Guard></Route>
              <Route path="/live-jobs">
                <Guard perm="operations.read"><LiveJobsPage /></Guard>
              </Route>
              <Route path="/reported-issues">
                <Guard perm="support.write"><ReportedIssuesPage /></Guard>
              </Route>
              <Route path="/rate-requests">
                <Guard perm="verification.write"><RateRequestsPage /></Guard>
              </Route>
              <Route path="/emergency-contacts" component={EmergencyContactsPage} />
              <Route path="/notification-templates"><Guard perm="settings.read"><NotificationTemplatesPage /></Guard></Route>
              <Route path="/login-history">
                <Guard perm="audit.read"><LoginHistoryPage /></Guard>
              </Route>
              <Route path="/invoices">
                <Guard perm="finance.read"><InvoicesPage /></Guard>
              </Route>
              <Route path="/leads">
                <Guard perm="users.read"><LeadsPage /></Guard>
              </Route>
            </Switch>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={base}>
          <AppShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
