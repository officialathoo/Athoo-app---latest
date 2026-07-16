export type NotificationRole = "customer" | "provider";

export type NotificationRouteInput = {
  type?: string;
  link?: string;
  bookingId?: string;
  chatId?: string;
  negotiationId?: string;
  broadcastRequestId?: string;
  callId?: string;
  refundId?: string;
  subscriptionId?: string;
  withdrawalId?: string;
  ticketId?: string;
  invoiceId?: string;
};

export type NotificationTarget =
  | string
  | { pathname: string; params?: Record<string, string> };

function cleanValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function normalizeLink(rawLink: unknown): string | undefined {
  const raw = cleanValue(rawLink);
  if (!raw) return undefined;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      return `${url.pathname}${url.search}`;
    }
    if (/^athoo:\/\//i.test(raw)) {
      const url = new URL(raw);
      return `/${url.hostname}${url.pathname}${url.search}`.replace(/\/{2,}/g, "/");
    }
  } catch {
    return undefined;
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

function roleHome(role: NotificationRole): string {
  return role === "provider"
    ? "/(provider)/(tabs)/dashboard"
    : "/(customer)/(tabs)/home";
}

function roleNotifications(role: NotificationRole): string {
  return role === "provider"
    ? "/(provider)/notifications"
    : "/(customer)/notifications";
}

export function resolveNotificationTarget(
  rawInput: NotificationRouteInput,
  role: NotificationRole,
): NotificationTarget {
  const input = {
    ...rawInput,
    type: cleanValue(rawInput.type)?.toLowerCase(),
    link: normalizeLink(rawInput.link),
    bookingId: cleanValue(rawInput.bookingId),
    chatId: cleanValue(rawInput.chatId),
    negotiationId: cleanValue(rawInput.negotiationId),
    broadcastRequestId: cleanValue(rawInput.broadcastRequestId),
    callId: cleanValue(rawInput.callId),
    refundId: cleanValue(rawInput.refundId),
    subscriptionId: cleanValue(rawInput.subscriptionId),
    withdrawalId: cleanValue(rawInput.withdrawalId),
    ticketId: cleanValue(rawInput.ticketId),
    invoiceId: cleanValue(rawInput.invoiceId),
  };

  if (input.callId || input.type === "call" || input.link === "/call") {
    // CallContext performs an immediate foreground recovery check and presents
    // the incoming-call overlay. Navigating to the role home avoids opening a
    // blank call screen before the active call has been restored.
    return roleHome(role);
  }

  if (input.chatId) {
    return {
      pathname: role === "provider" ? "/(provider)/chat-room" : "/(customer)/chat-room",
      params: { chatId: input.chatId },
    };
  }

  if (input.bookingId) {
    return {
      pathname: role === "provider" ? "/(provider)/job-detail" : "/(customer)/booking-detail",
      params: { bookingId: input.bookingId },
    };
  }

  if (input.negotiationId) {
    return {
      pathname: role === "provider" ? "/(provider)/negotiations" : "/(customer)/negotiate",
      params: { negId: input.negotiationId },
    };
  }

  if (input.broadcastRequestId) {
    return role === "provider"
      ? {
          pathname: "/(provider)/broadcast-jobs",
          params: { requestId: input.broadcastRequestId },
        }
      : {
          pathname: "/(customer)/broadcast-status",
          params: { requestId: input.broadcastRequestId },
        };
  }

  if (input.refundId || input.type === "refund") {
    return role === "provider" ? "/(provider)/(tabs)/earnings" : "/(customer)/refund-requests";
  }

  if (input.subscriptionId || input.type === "premium") {
    return role === "provider" ? "/(provider)/subscription" : "/(customer)/subscription";
  }

  if (input.withdrawalId || input.type === "withdrawal") {
    return role === "provider" ? "/(provider)/withdrawal-requests" : roleHome(role);
  }

  if (input.ticketId || input.type === "support" || input.type === "complaint") {
    return role === "provider" ? "/(provider)/support-tickets" : "/(customer)/support-tickets";
  }

  if (input.invoiceId || input.type === "invoice") {
    return role === "provider" ? "/(provider)/invoices" : "/(customer)/invoices";
  }

  const link = input.link?.split("?")[0].replace(/\/$/, "") || "";
  const chatMatch = link.match(/^\/chats?\/([^/]+)$/);
  if (chatMatch) {
    return {
      pathname: role === "provider" ? "/(provider)/chat-room" : "/(customer)/chat-room",
      params: { chatId: decodeURIComponent(chatMatch[1]) },
    };
  }

  const broadcastMatch = link.match(/^\/broadcasts?\/([^/]+)$/);
  if (broadcastMatch) {
    const requestId = decodeURIComponent(broadcastMatch[1]);
    return role === "provider"
      ? { pathname: "/(provider)/broadcast-jobs", params: { requestId } }
      : { pathname: "/(customer)/broadcast-status", params: { requestId } };
  }

  const bookingMatch = link.match(/^\/bookings\/([^/]+)$/);
  if (bookingMatch) {
    return {
      pathname: role === "provider" ? "/(provider)/job-detail" : "/(customer)/booking-detail",
      params: { bookingId: decodeURIComponent(bookingMatch[1]) },
    };
  }

  const negotiationMatch = link.match(/^\/negotiations\/([^/]+)$/);
  if (negotiationMatch) {
    return {
      pathname: role === "provider" ? "/(provider)/negotiations" : "/(customer)/negotiate",
      params: { negId: decodeURIComponent(negotiationMatch[1]) },
    };
  }

  if (link === "/profile" || link === "/provider/profile") {
    return role === "provider" ? "/(provider)/(tabs)/profile" : "/(customer)/(tabs)/profile";
  }
  if (link === "/provider/dashboard") return "/(provider)/(tabs)/dashboard";
  if (link === "/provider/availability") return "/(provider)/availability";
  if (link === "/premium") return role === "provider" ? "/(provider)/subscription" : "/(customer)/subscription";
  if (link === "/refunds") return role === "provider" ? "/(provider)/(tabs)/earnings" : "/(customer)/refund-requests";
  if (link === "/withdrawals") return role === "provider" ? "/(provider)/withdrawal-requests" : roleHome(role);
  if (link === "/support" || link === "/complaints") return role === "provider" ? "/(provider)/support-tickets" : "/(customer)/support-tickets";
  if (link === "/invoices") return role === "provider" ? "/(provider)/invoices" : "/(customer)/invoices";
  if (link === "/notifications") return roleNotifications(role);

  if (input.type === "message" || input.type === "chat") {
    return role === "provider" ? "/(provider)/(tabs)/chat" : "/(customer)/(tabs)/chat";
  }
  if (input.type === "negotiation") {
    return role === "provider" ? "/(provider)/negotiations" : "/(customer)/negotiate";
  }
  if (input.type === "broadcast" || input.type === "job") {
    return role === "provider" ? "/(provider)/broadcast-jobs" : roleHome(role);
  }

  return roleHome(role);
}
