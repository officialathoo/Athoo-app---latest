import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Column<T> {
  header: string;
  key?: keyof T;
  render?: (row: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  keyExtractor: (row: T) => string;
  caption?: string;
}

export function DataTable<T>({ columns, data, loading, emptyMessage = "No data found.", emptyDescription = "Try adjusting your filters or check again later.", keyExtractor, caption }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-3 p-5" role="status" aria-label="Loading table data">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-11 w-full rounded-lg" />)}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500" aria-hidden="true">
          <Inbox size={22} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-800">{emptyMessage}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {columns.map((col) => (
              <th key={col.header} scope="col" className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 ${col.width || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row) => (
            <tr key={keyExtractor(row)} className="transition-colors hover:bg-blue-50/40">
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-3 text-slate-700 ${col.width || ""}`}>
                  {col.render ? col.render(row) : col.key ? String(row[col.key] ?? "—") : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
