import { CheckCircle2, Circle, Clock3, XCircle } from "lucide-react";

const FLOW = [
  { key: "pending", label: "Requested" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
] as const;

const order = FLOW.map((item) => item.key);

export function BookingTimeline({ status }: { status: string }) {
  const cancelled = status === "cancelled";
  const current = order.indexOf(status as (typeof order)[number]);

  return (
    <section aria-label="Booking lifecycle" data-testid="admin-booking-timeline" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booking lifecycle</p>
          <p className="text-sm text-slate-600">Operational status at a glance</p>
        </div>
        {cancelled && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Cancelled</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FLOW.map((item, index) => {
          const done = !cancelled && current >= index;
          const active = !cancelled && current === index;
          const Icon = cancelled && index === Math.max(current, 0) ? XCircle : done ? CheckCircle2 : active ? Clock3 : Circle;
          return (
            <div key={item.key} className={`rounded-lg border px-3 py-3 ${active ? "border-blue-300 bg-blue-50" : done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
              <Icon size={17} className={active ? "text-blue-600" : done ? "text-emerald-600" : "text-slate-400"} />
              <p className="mt-2 text-xs font-semibold text-slate-700">{item.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
