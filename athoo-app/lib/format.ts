export function formatPKR(n: number | string | null | undefined): string {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
}

export function formatPKRCompact(n: number | string | null | undefined): string {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `Rs. ${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `Rs. ${(num / 1_000).toFixed(1)}k`;
  return `Rs. ${num}`;
}
