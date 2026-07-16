import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import { addSubscriber, removeSubscriber } from "./lib/eventBus";
import { registerSessionConnection, unregisterSessionConnection } from "./lib/sessionConnections";
import { isSessionActive } from "./lib/session";
import { db } from "@workspace/db";
import { callsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const jwtSecret = process.env["JWT_SECRET"];
if (!jwtSecret) throw new Error("FATAL: JWT_SECRET is required. WebSocket server cannot start without it.");
const JWT_SECRET: string = jwtSecret;
const JWT_ISSUER = process.env.JWT_ISSUER || "athoo-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "athoo-clients";

const callRooms = new Map<string, Set<WebSocket>>();
const WS_MAX_PAYLOAD_BYTES = Number(process.env.WS_MAX_PAYLOAD_BYTES || 64 * 1024);
if (!Number.isInteger(WS_MAX_PAYLOAD_BYTES) || WS_MAX_PAYLOAD_BYTES < 1024 || WS_MAX_PAYLOAD_BYTES > 1024 * 1024) {
  throw new Error("WS_MAX_PAYLOAD_BYTES must be an integer between 1024 and 1048576");
}

const ACTIVE_CALL_STATUSES = new Set(["ringing", "active"]);

type DecodedToken = { userId: string; role: string; sessionId: string; deviceId?: string; tokenType?: string; purpose?: string };

function decodeToken(token: string | null): DecodedToken | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }) as unknown as DecodedToken;
    if (decoded.tokenType !== "purpose" || decoded.purpose !== "realtime") return null;
    if (!decoded?.userId || !decoded?.role || !decoded?.sessionId) return null;
    return { userId: decoded.userId, role: decoded.role, sessionId: decoded.sessionId, deviceId: decoded.deviceId };
  } catch {
    return null;
  }
}

function sendAuthError(ws: WebSocket, reason: string, closeCode = 4401): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "auth:error", payload: { reason } }));
    }
  } catch { /* ignore */ }
  try { ws.close(closeCode, reason.slice(0, 120)); } catch { try { ws.terminate(); } catch { /* ignore */ } }
}

async function getActiveCallForParticipant(callId: string, userId: string) {
  const call = await db.query.callsTable.findFirst({ where: eq(callsTable.id, callId) });
  if (!call || (call.callerId !== userId && call.receiverId !== userId)) return null;
  if (!ACTIVE_CALL_STATUSES.has(String(call.status))) return null;
  return call;
}

function startSessionHeartbeat(
  ws: WebSocket,
  decoded: DecodedToken,
  additionalValidation?: () => Promise<boolean>,
): ReturnType<typeof setInterval> {
  let validating = false;
  return setInterval(async () => {
    if (validating || ws.readyState !== WebSocket.OPEN) return;
    validating = true;
    try {
      const active = await isSessionActive(decoded.sessionId, decoded.userId, decoded.deviceId);
      if (!active) {
        sendAuthError(ws, "session_revoked", 4401);
        return;
      }
      if (additionalValidation && !(await additionalValidation())) {
        sendAuthError(ws, "call_inactive", 4404);
        return;
      }
      ws.ping();
    } catch {
      // Do not disconnect on a single transient database failure. The next
      // heartbeat retries, while the connection remains bounded by session caps.
      try { ws.ping(); } catch { /* ignore */ }
    } finally {
      validating = false;
    }
  }, 25_000);
}

function makeCleanup(cleanup: () => void): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    cleanup();
  };
}

export function setupWebSocket(server: Server) {
  const callsWss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });
  const eventsWss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url || "";
    const callMatch = url.match(/^(?:\/api)?\/ws\/calls\/([^/?]+)/);
    if (callMatch) {
      callsWss.handleUpgrade(req, socket as any, head, (ws) => callsWss.emit("connection", ws, req));
      return;
    }

    if (/^(?:\/api)?\/ws\/events(?:\?|$)/.test(url)) {
      eventsWss.handleUpgrade(req, socket as any, head, (ws) => eventsWss.emit("connection", ws, req));
      return;
    }

    socket.destroy();
  });

  callsWss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = req.url || "";
      const match = url.match(/^(?:\/api)?\/ws\/calls\/([^/?]+)/);
      if (!match) { sendAuthError(ws, "invalid_call_path", 4400); return; }

      const parsedUrl = new URL(url, "http://localhost");
      const decoded = decodeToken(parsedUrl.searchParams.get("token"));
      if (!decoded || !(await isSessionActive(decoded.sessionId, decoded.userId, decoded.deviceId))) {
        sendAuthError(ws, "invalid_or_revoked_session", 4401);
        return;
      }

      const callId = match[1] as string;
      const call = await getActiveCallForParticipant(callId, decoded.userId);
      if (!call) {
        sendAuthError(ws, "call_forbidden_or_inactive", 4403);
        return;
      }

      const sessionConnection = registerSessionConnection(ws, decoded.userId, decoded.sessionId);
      if (!sessionConnection) {
        sendAuthError(ws, "too_many_realtime_connections", 4429);
        return;
      }

      if (!callRooms.has(callId)) callRooms.set(callId, new Set());
      const room = callRooms.get(callId)!;
      room.add(ws);

      const sessionHeartbeat = startSessionHeartbeat(
        ws,
        decoded,
        async () => Boolean(await getActiveCallForParticipant(callId, decoded.userId)),
      );

      ws.on("message", (data: Buffer, isBinary: boolean) => {
        if (isBinary || ws.readyState !== WebSocket.OPEN) return;
        for (const client of room) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            try { client.send(data, { binary: false }); } catch { /* peer cleanup handles failure */ }
          }
        }
      });

      const cleanup = makeCleanup(() => {
        clearInterval(sessionHeartbeat);
        unregisterSessionConnection(sessionConnection);
        room.delete(ws);
        if (room.size === 0) callRooms.delete(callId);
      });
      ws.on("close", cleanup);
      ws.on("error", cleanup);
    } catch {
      sendAuthError(ws, "realtime_auth_unavailable", 1011);
    }
  });

  eventsWss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const decoded = decodeToken(url.searchParams.get("token"));
      if (!decoded || !(await isSessionActive(decoded.sessionId, decoded.userId, decoded.deviceId))) {
        sendAuthError(ws, "invalid_or_revoked_session", 4401);
        return;
      }

      const sessionConnection = registerSessionConnection(ws, decoded.userId, decoded.sessionId);
      if (!sessionConnection) {
        sendAuthError(ws, "too_many_realtime_connections", 4429);
        return;
      }

      const sub = { ws, userId: decoded.userId, role: decoded.role };
      addSubscriber(sub);
      try { ws.send(JSON.stringify({ event: "connected", payload: { userId: decoded.userId, role: decoded.role } })); } catch { /* ignore */ }

      const sessionHeartbeat = startSessionHeartbeat(ws, decoded);
      const cleanup = makeCleanup(() => {
        clearInterval(sessionHeartbeat);
        unregisterSessionConnection(sessionConnection);
        removeSubscriber(sub);
      });
      ws.on("close", cleanup);
      ws.on("error", cleanup);
    } catch {
      sendAuthError(ws, "realtime_auth_unavailable", 1011);
    }
  });
}
