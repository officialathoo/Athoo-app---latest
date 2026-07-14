import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

export type SearchableSelectOption = { value: string; label: string; description?: string; keywords?: string[] };

export function SearchableSelect({ value, onChange, options, placeholder = "Select an option", searchPlaceholder = "Search...", emptyText = "No matching options", disabled = false, clearable = true }: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => [option.label, option.value, option.description || "", ...(option.keywords || [])].some((term) => term.toLowerCase().includes(query)));
  }, [options, search]);

  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-slate-300 focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-60">
        <span className={selected ? "truncate text-slate-800" : "truncate text-slate-400"}>{selected?.label || placeholder}</span>
        <span className="flex items-center gap-1">
          {clearable && value ? <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onChange(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChange(""); } }} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear selection"><X size={14} /></span> : null}
          <ChevronsUpDown size={15} className="text-slate-400" />
        </span>
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} className="w-full text-sm outline-none" placeholder={searchPlaceholder} />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length ? filtered.map((option) => (
              <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); setSearch(""); }} className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 ${option.value === value ? "bg-blue-50" : ""}`}>
                <Check size={15} className={`mt-0.5 shrink-0 ${option.value === value ? "text-blue-600" : "text-transparent"}`} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{option.label}</span>{option.description ? <span className="block truncate text-xs text-slate-500">{option.description}</span> : null}</span>
              </button>
            )) : <p className="px-3 py-5 text-center text-sm text-slate-500">{emptyText}</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
