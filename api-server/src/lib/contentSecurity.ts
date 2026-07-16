/** Security helpers for user/admin-authored content rendered outside JSON. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Prevent spreadsheet formula execution when CSV is opened in Excel/Sheets. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\u0000/g, "");
  if (/^[\s]*[=+@-]/.test(text) || text.startsWith("\t") || text.startsWith("\r")) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function sanitizeHttpsUrl(value: unknown, maxLength = 1000): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > maxLength || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || !parsed.hostname) return null;
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Marketing actions may point to an HTTPS page or an internal Expo route.
 * Protocol-relative URLs, backslashes and control characters are rejected.
 */
export function sanitizeHttpsOrAppPath(value: unknown, maxLength = 500): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > maxLength || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || !/^\/[A-Za-z0-9_()\-./?=&%:]*$/.test(raw)) return null;
    return raw;
  }
  return sanitizeHttpsUrl(raw, maxLength);
}
