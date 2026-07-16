import type { WebSocket } from "ws";

export type SessionConnection = {
  ws: WebSocket;
  userId: string;
  sessionId: string;
};

const connections = new Set<SessionConnection>();
const parsedMaxConnections = Number(process.env.WS_MAX_CONNECTIONS_PER_SESSION || 8);
const MAX_CONNECTIONS_PER_SESSION = Number.isInteger(parsedMaxConnections) && parsedMaxConnections >= 1 && parsedMaxConnections <= 32
  ? parsedMaxConnections
  : 8;

export function registerSessionConnection(ws: WebSocket, userId: string, sessionId: string): SessionConnection | null {
  let count = 0;
  for (const connection of connections) {
    if (connection.sessionId === sessionId) count += 1;
  }
  if (count >= MAX_CONNECTIONS_PER_SESSION) return null;

  const connection = { ws, userId, sessionId };
  connections.add(connection);
  return connection;
}

export function unregisterSessionConnection(connection: SessionConnection | null): void {
  if (connection) connections.delete(connection);
}

function closeConnection(connection: SessionConnection, reason: string): void {
  connections.delete(connection);
  try {
    if (connection.ws.readyState === 0 || connection.ws.readyState === 1) {
      connection.ws.close(4401, reason.slice(0, 120));
    }
  } catch {
    try { connection.ws.terminate(); } catch { /* ignore */ }
  }
}

export function disconnectSessions(sessionIds: Iterable<string>, reason = "session_revoked"): number {
  const ids = new Set(Array.from(sessionIds).filter(Boolean));
  if (ids.size === 0) return 0;
  let disconnected = 0;
  for (const connection of Array.from(connections)) {
    if (ids.has(connection.sessionId)) {
      closeConnection(connection, reason);
      disconnected += 1;
    }
  }
  return disconnected;
}

export function disconnectUserSessions(userId: string, exceptSessionId?: string, reason = "session_replaced"): number {
  if (!userId) return 0;
  let disconnected = 0;
  for (const connection of Array.from(connections)) {
    if (connection.userId === userId && connection.sessionId !== exceptSessionId) {
      closeConnection(connection, reason);
      disconnected += 1;
    }
  }
  return disconnected;
}
