import type { WebSocket } from "ws";

const MAX_VIEWING_CHAT_ID_LENGTH = 120;

type Subscriber = {
  ws: WebSocket;
  userId: string;
  role: string;
  /** Chat room this connection is currently viewing, used to suppress native push noise. */
  viewingChatId?: string | null;
};

const subscribers = new Set<Subscriber>();

export function addSubscriber(sub: Subscriber): void {
  subscribers.add(sub);
}

export function removeSubscriber(sub: Subscriber): void {
  subscribers.delete(sub);
}

/**
 * Mark (or clear) the chat room a specific realtime connection is viewing.
 * State lives on the subscriber object, so it is released automatically when
 * the connection closes.
 */
export function setSubscriberViewingChat(userId: string, ws: WebSocket, chatId: unknown): void {
  const normalized = typeof chatId === "string" ? chatId.trim().slice(0, MAX_VIEWING_CHAT_ID_LENGTH) : "";
  for (const sub of subscribers) {
    if (sub.ws === ws && sub.userId === userId) {
      sub.viewingChatId = normalized || null;
      return;
    }
  }
}

/** True when at least one live connection of this user is viewing chatId. */
export function isUserViewingChat(userId: string, chatId: string): boolean {
  if (!userId || !chatId) return false;
  for (const sub of subscribers) {
    if (sub.userId === userId && sub.viewingChatId === chatId) return true;
  }
  return false;
}

export type EventName =
  | "booking:new"
  | "booking:updated"
  | "booking:accepted"
  | "booking:status"
  | "booking:location"
  | "booking:arrived"
  | "booking:started"
  | "booking:completed"
  | "booking:cancelled"
  | "negotiation:new"
  | "negotiation:updated"
  | "negotiation:expired"
  | "negotiation:accepted"
  | "negotiation:rejected"
  | "chat:message"
  | "chat:read"
  | "chat:delivered"
  | "profile:updated"
  | "notification:new"
  | "notification:push-failed"
  | "account:inactivity-cleared"
  | "provider:availability"
  | "provider:location"
  | "admin:metric"
  | "admin:event"
  | "broadcast:new"
  | "broadcast:response"
  | "broadcast:accepted"
  | "broadcast:selected"
  | "broadcast:rejected"
  | "broadcast:cancelled"
  | "call:incoming"
  | "call:accepted"
  | "call:ice-candidate"
  | "call:rejected"
  | "call:ended"
  | "call:mute"
  | "booking:location-updated";

type EventPayload = Record<string, unknown>;

function safeSend(ws: WebSocket, message: string): void {
  try {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  } catch {
    /* swallow */
  }
}

export function emitToUser(userId: string, event: EventName, payload: EventPayload): number {
  if (!userId) return 0;
  const message = JSON.stringify({ event, type: event, payload, ts: Date.now() });
  let count = 0;
  for (const sub of subscribers) {
    if (sub.userId === userId) {
      safeSend(sub.ws, message);
      count += 1;
    }
  }
  return count;
}

export function emitToUsers(userIds: string[], event: EventName, payload: EventPayload): void {
  if (!userIds.length) return;
  const ids = new Set(userIds.filter(Boolean));
  if (ids.size === 0) return;
  const message = JSON.stringify({ event, type: event, payload, ts: Date.now() });
  for (const sub of subscribers) {
    if (ids.has(sub.userId)) safeSend(sub.ws, message);
  }
}

export function emitToRole(role: "customer" | "provider" | "admin", event: EventName, payload: EventPayload): void {
  const message = JSON.stringify({ event, type: event, payload, ts: Date.now() });
  for (const sub of subscribers) {
    if (sub.role === role) safeSend(sub.ws, message);
  }
}

