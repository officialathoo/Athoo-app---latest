/** Escape a CSV cell and neutralize spreadsheet formulas from user-controlled data. */
export function safeCsvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\u0000/g, "");
  if (/^[\s]*[=+@-]/.test(text) || text.startsWith("\t") || text.startsWith("\r")) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(safeCsvCell).join(",")).join("\n");
}
