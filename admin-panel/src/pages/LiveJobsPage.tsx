import { useQuery } from "@tanstack/react-query";
import { api, currency } from "@/lib/api";
import { Activity, MapPin, Clock, Phone, RefreshCw, Loader2, User, Wrench } from "lucide-react";
import { useState } from "react";

type LiveBooking = {
  id: string;
  customerName: string;
  customerPhone: string;
  providerName: string;
  providerPhone: string;
  service: string;
  address: string;
  status: string;
  price?: number;
  startedAt?: string;
  scheduledDate: string;
  scheduledTime: string;
  providerLat?: number;
  providerLng?: number;
};

const STATUS_STYLE: Record<string, string> = {
  accepted: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-purple-100 text-purple-700 border-purple-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
};

function elapsed(startedAt?: string) {
  if (!startedAt) return "—";
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function LiveJobsPage() {
  const [statusFilter, setStatusFilter] = useState<"all" | "accepted" | "in_progress">("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["live-jobs"],
    queryFn: () => api<{ bookings: LiveBooking[] }>("/api/admin/bookings?status=accepted,in_progress&limit=100"),
    refetchInterval: 120000,
    staleTime: 10000,
  });

  const bookings = (data?.bookings ?? []).filter(b =>
    statusFilter === "all" ? ["accepted", "in_progress"].includes(b.status) : b.status === statusFilter
  );

  const inProgress = (data?.bookings ?? []).filter(b => b.status === "in_progress").length;
  const accepted = (data?.bookings ?? []).filter(b => b.status === "accepted").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Live Jobs Monitor</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time view of active bookings — refreshes every 15s</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 bg-white transition-all"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-purple-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Progress</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{inProgress}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-blue-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Accepted</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{accepted}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench size={16} className="text-emerald-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Live</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{inProgress + accepted}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "accepted", "in_progress"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "all" ? "All Live" : s === "in_progress" ? "In Progress" : "Accepted"}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading live jobs…
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Activity size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No live jobs right now</p>
          <p className="text-slate-400 text-sm mt-1">Active bookings will appear here automatically</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {bookings.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[b.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {b.status === "in_progress" ? "In Progress" : "Accepted"}
                    </span>
                    {b.status === "in_progress" && b.startedAt && (
                      <span className="text-xs text-purple-600 font-medium">⏱ {elapsed(b.startedAt)}</span>
                    )}
                    <span className="text-xs text-slate-400 font-mono">#{b.id.slice(-6)}</span>
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm">{b.service}</h3>
                  <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                    <MapPin size={11} />
                    <span className="truncate">{b.address}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <Clock size={11} />
                    <span>{b.scheduledDate} at {b.scheduledTime}</span>
                  </div>
                </div>
                {b.price && (
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-slate-800">{currency(b.price)}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <User size={13} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{b.customerName}</p>
                    <p className="text-xs text-slate-400">{b.customerPhone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Wrench size={13} className="text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{b.providerName}</p>
                    <p className="text-xs text-slate-400">{b.providerPhone}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
