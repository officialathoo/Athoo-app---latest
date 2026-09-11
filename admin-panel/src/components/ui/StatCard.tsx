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

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  trend,
  trendUp,
  to,
  testId,
}: StatCardProps) {
  const inner = (
    <div
      data-testid={testId}
      className={`h-full rounded-xl border border-border bg-card p-4 shadow-sm transition duration-200 ${
        to
          ? "group cursor-pointer hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-card-foreground">
            {value}
          </p>
          {trend ? (
            <p
              className={`mt-1 text-xs font-semibold ${
                trendUp ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {trend}
            </p>
          ) : null}
        </div>

        <div className={`${iconBg} shrink-0 rounded-lg p-2.5`} aria-hidden="true">
          <Icon size={19} className={iconColor} />
        </div>
      </div>

      {to ? (
        <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary">
          View details <ArrowUpRight size={12} />
        </div>
      ) : null}
    </div>
  );

  if (to) {
    return (
      <Link
        href={to}
        className="block h-full no-underline"
        aria-label={`View ${label}`}
      >
        {inner}
      </Link>
    );
  }

  return inner;
}