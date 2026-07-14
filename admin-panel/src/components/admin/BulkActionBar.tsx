import { Loader2, X } from "lucide-react";

export function BulkActionBar({
  count,
  busy,
  onClear,
  actions,
}: {
  count: number;
  busy?: boolean;
  onClear: () => void;
  actions: Array<{ label: string; onClick: () => void; tone?: "primary" | "danger" | "neutral" }>;
}) {
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <span className="mr-auto text-sm font-semibold text-blue-900">{count} selected</span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={busy}
          onClick={action.onClick}
          className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
            action.tone === "danger"
              ? "bg-red-600 text-white hover:bg-red-700"
              : action.tone === "neutral"
                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {busy ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : null}
          {action.label}
        </button>
      ))}
      <button type="button" onClick={onClear} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Clear selection">
        <X size={16} />
      </button>
    </div>
  );
}
