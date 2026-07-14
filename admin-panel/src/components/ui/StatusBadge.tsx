interface StatusBadgeProps {
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  accepted: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  active: "bg-green-100 text-green-800 border-green-200",
  blocked: "bg-red-100 text-red-800 border-red-200",
  verified: "bg-emerald-100 text-emerald-800 border-emerald-200",
  unverified: "bg-slate-100 text-slate-600 border-slate-200",
  deactivated: "bg-gray-100 text-gray-600 border-gray-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paid: "bg-cyan-100 text-cyan-800 border-cyan-200",
  all: "bg-indigo-100 text-indigo-800 border-indigo-200",
  customers: "bg-sky-100 text-sky-800 border-sky-200",
  providers: "bg-orange-100 text-orange-800 border-orange-200",
  customer: "bg-sky-100 text-sky-800 border-sky-200",
  provider: "bg-orange-100 text-orange-800 border-orange-200",
  admin: "bg-violet-100 text-violet-800 border-violet-200",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = status.replace(/_/g, " ");
  const colors = STATUS_COLORS[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors} capitalize`}>
      {label}
    </span>
  );
}

