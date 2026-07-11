import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: string;
  trendUp?: boolean;
  to?: string;
  testId?: string;
}

export function StatCard({ label, value, icon: Icon, iconColor = "text-blue-600", iconBg = "bg-blue-50", trend, trendUp, to, testId }: StatCardProps) {
  const inner = (
    <div
      data-testid={testId}
      className={`h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200${to ? " cursor-pointer hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md group" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          {trend ? (
            <p className={`mt-1 text-xs font-semibold ${trendUp ? "text-emerald-600" : "text-red-500"}`}>{trend}</p>
          ) : null}
        </div>
        <div className={`${iconBg} rounded-xl p-2.5 shrink-0`} aria-hidden="true">
          <Icon size={20} className={iconColor} />
        </div>
      </div>
      {to ? (
        <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-slate-400 transition-colors group-hover:text-blue-600">
          View details <ArrowUpRight size={12} />
        </div>
      ) : null}
    </div>
  );

  if (to) {
    return <Link href={to} className="block h-full no-underline" aria-label={`View ${label}`}>{inner}</Link>;
  }
  return inner;
}
