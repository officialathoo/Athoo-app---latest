import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { api, currency, formatDate } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable } from "@/components/ui/DataTable";
import { Wallet, TrendingUp, Clock, AlertCircle, RefreshCw, Settings, CheckCircle, ArrowDownLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

interface PlatformSettings {
  commissionRate: number;
  defaultCommissionLimit: number;
}
interface ProviderDue {
  id: string; name: string; phone: string; pendingCommission: number; totalCommission: number;
  commissionLimit: number | null; isBlocked: boolean;
}
interface LedgerEntry {
  id: string; entryType: "commission_received" | "provider_withdrawal" | "customer_refund" | "subscription_received";
  referenceType: string; referenceId: string; amount: number; paymentReference?: string | null;
  note?: string | null; occurredAt: string;
}
interface FinanceSummary {
  settings: PlatformSettings;
  providerDues: ProviderDue[];
  totals: {
    completedJobValue: number; commissionEarned: number; providerEarnings: number; completedBookings: number;
    commissionReceived: number; withdrawalsPaid: number; refundsPaid: number; subscriptionRevenue: number;
    pendingCommissionDues: number; blockedProviders: number;
  };
  queues: {
    pendingCommissionProofs: number; pendingWithdrawals: number; approvedWithdrawals: number;
    pendingRefunds: number; approvedRefunds: number;
  };
  recentLedger: LedgerEntry[];
}

const LEDGER_LABEL: Record<string, string> = {
  commission_received: "Commission received",
  provider_withdrawal: "Provider withdrawal",
  customer_refund: "Customer refund",
  subscription_received: "Subscription received",
};

export function FinancePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isSuperAdmin } = usePermissions();
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ commissionRate: "10", defaultCommissionLimit: "5000" });
  const [savingSettings, setSavingSettings] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api<FinanceSummary>("/api/admin/finance/summary");
      setData(response);
      setSettingsForm({
        commissionRate: String(response.settings.commissionRate),
        defaultCommissionLimit: String(response.settings.defaultCommissionLimit),
      });
    } catch (error) {
      setLoadError((error as Error).message || "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: {
          commissionRate: Number(settingsForm.commissionRate),
          defaultCommissionLimit: Number(settingsForm.defaultCommissionLimit),
        },
      });
      toast({ title: "Finance settings saved" });
      setShowSettings(false);
      await load();
    } catch (error) {
      toast({ title: "Failed to save settings", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  }

  const queueCards = useMemo(() => data ? [
    { label: "Commission proofs", count: data.queues.pendingCommissionProofs, path: "/commission-payments" },
    { label: "Pending withdrawals", count: data.queues.pendingWithdrawals, path: "/withdrawals" },
    { label: "Approved payouts", count: data.queues.approvedWithdrawals, path: "/withdrawals" },
    { label: "Pending refunds", count: data.queues.pendingRefunds, path: "/refunds" },
    { label: "Approved refunds awaiting payout", count: data.queues.approvedRefunds, path: "/refunds" },
  ] : [], [data]);

  const totals = data?.totals;
  const settings = data?.settings || { commissionRate: 10, defaultCommissionLimit: 5000 };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Finance Control Center</h1>
          <p className="text-sm text-slate-500 mt-1">Authoritative completed-job totals and manual cash movements.</p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin() && <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50"><Settings size={15}/> Settings</button>}
          <button onClick={load} className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50" aria-label="Refresh finance summary"><RefreshCw size={16}/></button>
        </div>
      </div>

      {loadError && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">{loadError} <button onClick={load} className="underline ml-2">Retry</button></div>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Completed Job Value" value={currency(totals?.completedJobValue || 0)} icon={TrendingUp} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <StatCard label="Commission Earned" value={currency(totals?.commissionEarned || 0)} icon={Wallet} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatCard label="Commission Received" value={currency(totals?.commissionReceived || 0)} icon={ArrowDownLeft} iconColor="text-indigo-600" iconBg="bg-indigo-50" />
        <StatCard label="Pending Provider Dues" value={currency(totals?.pendingCommissionDues || 0)} icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Provider Earnings" value={currency(totals?.providerEarnings || 0)} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
        <StatCard label="Withdrawals Paid" value={currency(totals?.withdrawalsPaid || 0)} icon={ArrowUpRight} iconColor="text-violet-600" iconBg="bg-violet-50" />
        <StatCard label="Refunds Paid" value={currency(totals?.refundsPaid || 0)} icon={RotateCcw} iconColor="text-rose-600" iconBg="bg-rose-50" />
        <StatCard label="Subscription Revenue" value={currency(totals?.subscriptionRevenue || 0)} icon={CheckCircle} iconColor="text-cyan-600" iconBg="bg-cyan-50" />
        <StatCard label="Blocked Providers" value={totals?.blockedProviders || 0} icon={AlertCircle} iconColor="text-red-600" iconBg="bg-red-50" />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {queueCards.map((item) => (
          <button key={item.label} onClick={() => navigate(item.path)} className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{item.count}</p>
            <p className="text-xs text-slate-500 mt-1">{item.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <div><p className="text-sm font-semibold text-blue-800">Commission rate: {settings.commissionRate}%</p><p className="text-xs text-blue-600 mt-0.5">Default provider due limit: {currency(settings.defaultCommissionLimit)}</p></div>
        <p className="text-xs text-blue-700">Direct balance clearing is disabled. Review submitted evidence instead.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100"><h2 className="font-semibold text-slate-900">Provider Commission Dues</h2><p className="text-xs text-slate-500 mt-1">Balances derive from completed bookings and approved payment evidence.</p></div>
        <DataTable
          data={data?.providerDues || []}
          loading={loading}
          keyExtractor={(row) => row.id}
          emptyMessage="No providers currently owe commission."
          columns={[
            { header: "Provider", render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-xs text-slate-400">{row.phone}</p></div> },
            { header: "Pending Due", render: (row) => <span className="font-semibold text-amber-700">{currency(row.pendingCommission)}</span> },
            { header: "Total Earned", render: (row) => currency(row.totalCommission) },
            { header: "Limit", render: (row) => currency(row.commissionLimit || settings.defaultCommissionLimit) },
            { header: "Status", render: (row) => <span className={`text-xs px-2 py-1 rounded-full ${row.isBlocked ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{row.isBlocked ? "Blocked" : "Active"}</span> },
          ]}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex justify-between"><div><h2 className="font-semibold text-slate-900">Recent Cash Ledger</h2><p className="text-xs text-slate-500 mt-1">Immutable entries created only when money movement is confirmed.</p></div><button onClick={() => navigate('/reports')} className="text-sm text-blue-600">Reports & export</button></div>
        <DataTable
          data={data?.recentLedger || []}
          loading={loading}
          keyExtractor={(row) => row.id}
          emptyMessage="No confirmed manual cash movements yet."
          columns={[
            { header: "Type", render: (row) => LEDGER_LABEL[row.entryType] || row.entryType },
            { header: "Amount", render: (row) => <span className="font-semibold">{currency(row.amount)}</span> },
            { header: "Reference", render: (row) => <span className="font-mono text-xs">{row.paymentReference || row.referenceId}</span> },
            { header: "Note", render: (row) => <span className="text-sm text-slate-500">{row.note || "—"}</span> },
            { header: "Date", render: (row) => <span className="text-xs text-slate-500">{formatDate(row.occurredAt)}</span> },
          ]}
        />
      </div>

      {showSettings && isSuperAdmin() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b flex justify-between"><h3 className="font-semibold">Commission Settings</h3><button onClick={() => setShowSettings(false)}>×</button></div>
            <div className="p-5 space-y-4">
              <label className="block text-xs font-medium">Commission Rate (%)<input type="number" min={0} max={100} value={settingsForm.commissionRate} onChange={(e) => setSettingsForm((v) => ({...v, commissionRate: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2"/></label>
              <label className="block text-xs font-medium">Default Commission Limit (Rs.)<input type="number" min={100} value={settingsForm.defaultCommissionLimit} onChange={(e) => setSettingsForm((v) => ({...v, defaultCommissionLimit: e.target.value}))} className="mt-1 w-full border rounded-lg px-3 py-2"/></label>
              <button onClick={saveSettings} disabled={savingSettings} className="w-full flex justify-center items-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 disabled:opacity-50">{savingSettings ? "Saving…" : <><CheckCircle size={16}/> Save Settings</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
