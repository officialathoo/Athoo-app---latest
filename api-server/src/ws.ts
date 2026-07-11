import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import { addSubscriber, removeSubscriber } from "./lib/eventBus";
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

type DecodedToken = { userId: string; role: string; sessionId: string; tokenType?: string; purpose?: string };

function decodeToken(token: string | null): DecodedToken | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }) as unknown as DecodedToken;
    if (decoded.tokenType !== "purpose" || decoded.purpose !== "realtime") return null;
    if (!decoded?.userId || !decoded?.role || !decoded?.sessionId) return null;
    return { userId: decoded.userId, role: decoded.role, sessionId: decoded.sessionId };
  } catch {
    return null;
  }
}

export function setupWebSocket(server: Server) {
  const callsWss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });
  const eventsWss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD_BYTES });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url || "";
    const callMatch = url.match(/^(?:\/api)?\/ws\/calls\/([^/?]+)/);
    if (callMatch) {
      callsWss.handleUpgrade(req, socket as any, head, (ws) => {
        callsWss.emit("connection", ws, req);
      });
      return;
    }

    const eventsMatch = url.match(/^(?:\/api)?\/ws\/events(?:\?|$)/);
    if (eventsMatch) {
      eventsWss.handleUpgrade(req, socket as any, head, (ws) => {
        eventsWss.emit("connection", ws, req);
      });
      return;
    }

    socket.destroy();
  });

  callsWss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url || "";
    const match = url.match(/^(?:\/api)?\/ws\/calls\/([^/?]+)/);
    if (!match) { ws.close(); return; }

    // Authenticate the caller before allowing access to the call room.
    const parsedUrl = new URL(url, "http://localhost");
    const token = parsedUrl.searchParams.get("token");
    const decoded = decodeToken(token);
    if (!decoded || !(await isSessionActive(decoded.sessionId, decoded.userId))) {
      try { ws.send(JSON.stringify({ event: "auth:error", payload: { reason: "invalid_or_revoked_session" } })); } catch { /* ignore */ }
      ws.close(4401, "invalid_or_revoked_session");
      return;
    }

    const callId = match[1] as string;
    const call = await db.query.callsTable.findFirst({ where: eq(callsTable.id, callId) });
    if (!call || (call.callerId !== decoded.userId && call.receiverId !== decoded.userId)) {
      try { ws.send(JSON.stringify({ event: "auth:error", payload: { reason: "call_forbidden" } })); } catch { /* ignore */ }
      ws.close(4403, "call_forbidden");
      return;
    }
    if (!callRooms.has(callId)) callRooms.set(callId, new Set());
    const room = callRooms.get(callId)!;
    room.add(ws);

    ws.on("message", (data: Buffer) => {
      for (const client of room) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: false });
        }
      }
    });

    ws.on("close", () => {
      room.delete(ws);
      if (room.size === 0) callRooms.delete(callId);
    });

    ws.on("error", () => {
      room.delete(ws);
    });
  });

  eventsWss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");
    const decoded = decodeToken(token);
    if (!decoded || !(await isSessionActive(decoded.sessionId, decoded.userId))) {
      try { ws.send(JSON.stringify({ event: "auth:error", payload: { reason: "invalid_or_revoked_session" } })); } catch { /* ignore */ }
      ws.close(4401, "invalid_or_revoked_session");
      return;
    }

    const sub = { ws, userId: decoded.userId, role: decoded.role };
    addSubscriber(sub);

    try {
      ws.send(JSON.stringify({ event: "connected", payload: { userId: decoded.userId, role: decoded.role } }));
    } catch { /* ignore */ }

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.ping(); } catch { /* ignore */ }
      }
    }, 25000);

    ws.on("close", () => {
      clearInterval(ping);
      removeSubscriber(sub);
    });

    ws.on("error", () => {
      clearInterval(ping);
      removeSubscriber(sub);
    });
  });
}

