export type AdminNotificationLike = {
  type?: string | null;
  link?: string | null;
};

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function cleanInternalLink(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || /[\r\n]/.test(raw)) return null;
  if (/^(?:https?:)?\/\//i.test(raw)) return null;
  if (/^(?:javascript|data):/i.test(raw)) return null;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function decodeId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return value; }
}

export function resolveAdminNotificationLink(notification: AdminNotificationLike): string | null {
  const raw = cleanInternalLink(notification.link);
  if (raw) {
    const [pathname, queryString = ""] = raw.split("?", 2);
    const query = new URLSearchParams(queryString);
    const mappings: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
      [/^\/admin\/subscriptions\/([^/]+)$/, (m) => withQuery("/plans", { tab: "subs", status: "pending", focus: decodeId(m[1]) })],
      [/^\/admin\/subscriptions(?:\/)?$/, () => withQuery("/plans", { tab: "subs", status: query.get("status") || "pending", focus: query.get("focus") || undefined })],
      [/^\/admin\/plans(?:\/)?$/, () => withQuery("/plans", { tab: "plans" })],
      [/^\/admin\/payments\/([^/]+)$/, (m) => withQuery("/commission", { status: "pending", focus: decodeId(m[1]) })],
      [/^\/admin\/support\/([^/]+)$/, (m) => withQuery("/complaints", { focus: decodeId(m[1]) })],
      [/^\/admin\/(?:support|complaints)(?:\/)?$/, () => withQuery("/complaints", { focus: query.get("focus") || undefined })],
      [/^\/admin\/requests(?:\/)?$/, () => withQuery("/requests", { tab: query.get("tab") || "services", status: query.get("status") || "pending", focus: query.get("focus") || undefined })],
      [/^\/admin\/leads\/([^/]+)$/, (m) => withQuery("/leads", { focus: decodeId(m[1]) })],
      [/^\/admin\/users\/([^/]+)$/, (m) => withQuery("/users", { focus: decodeId(m[1]) })],
      [/^\/admin\/providers\/([^/]+)$/, (m) => withQuery("/providers", { focus: decodeId(m[1]) })],
      [/^\/admin\/bookings\/([^/]+)$/, (m) => withQuery("/bookings", { focus: decodeId(m[1]) })],
      [/^\/admin\/negotiations\/([^/]+)$/, (m) => withQuery("/negotiations", { focus: decodeId(m[1]) })],
      [/^\/admin\/refunds\/([^/]+)$/, (m) => withQuery("/refunds", { focus: decodeId(m[1]) })],
      [/^\/admin\/withdrawals\/([^/]+)$/, (m) => withQuery("/withdrawals", { focus: decodeId(m[1]) })],
      [/^\/admin\/verification\/([^/]+)$/, (m) => withQuery("/verification", { focus: decodeId(m[1]) })],
      [/^\/admin\/document-renewals(?:\/)?$/, () => withQuery("/document-renewals", { status: query.get("status") || "pending", focus: query.get("focus") || undefined, provider: query.get("provider") || undefined })],
      [/^\/admin\/rate-requests\/([^/]+)$/, (m) => withQuery("/rate-requests", { focus: decodeId(m[1]) })],
      [/^\/admin\/reported-issues\/([^/]+)$/, (m) => withQuery("/reported-issues", { focus: decodeId(m[1]) })],
      [/^\/admin\/inactive-accounts(?:\/)?$/, () => withQuery("/inactive-accounts", { focus: query.get("focus") || undefined })],
      [/^\/admin\/policies(?:\/)?$/, () => "/policies"],
      [/^\/admin\/broadcasts(?:\/.*)?$/, () => "/broadcasts"],
      [/^\/admin\/finance(?:\/.*)?$/, () => "/finance"],
      [/^\/admin\/invoices(?:\/.*)?$/, () => "/invoices"],
    ];
    for (const [pattern, build] of mappings) {
      const match = pathname.match(pattern);
      if (match) return build(match);
    }

    const allowedDirect = new Set([
      "/", "/users", "/providers", "/bookings", "/negotiations", "/verification",
      "/finance", "/commission", "/withdrawals", "/refunds", "/requests", "/broadcasts",
      "/complaints", "/chat-moderation", "/reviews", "/reports", "/audit-log", "/categories",
      "/service-areas", "/payment-accounts", "/plans", "/live-jobs", "/reported-issues",
      "/rate-requests", "/notification-templates", "/invoices", "/leads",
      "/inactive-accounts", "/policies", "/document-renewals",
    ]);
    if (allowedDirect.has(pathname)) return raw;
  }

  const type = String(notification.type || "").toLowerCase();
  if (type.includes("subscription") || type.includes("premium")) return withQuery("/plans", { tab: "subs", status: "pending" });
  if (type.includes("payment") || type.includes("commission")) return withQuery("/commission", { status: "pending" });
  if (type.includes("support") || type.includes("complaint") || type.includes("ticket")) return "/complaints";
  if (type.includes("service") || type.includes("deletion") || type.includes("request")) return withQuery("/requests", { status: "pending" });
  if (type.includes("inactivity") || type.includes("inactive")) return "/inactive-accounts";
  if (type.includes("policy")) return "/policies";
  if (type.includes("lead")) return "/leads";
  if (type.includes("broadcast")) return "/broadcasts";
  if (type.includes("booking")) return "/bookings";
  if (type.includes("negotiation")) return "/negotiations";
  if (type.includes("provider") || type.includes("verification")) return "/providers";
  if (type.includes("refund")) return "/refunds";
  if (type.includes("withdraw")) return "/withdrawals";
  return null;
}
