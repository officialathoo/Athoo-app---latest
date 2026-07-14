import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { callsTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { emitToUser } from "../lib/eventBus";
import { Response } from "express";

const router = Router();
const incomingCallCache = new Map<string, { ts: number; payload: any }>();

function generateId(): string {
  return crypto.randomUUID();
}

// ── In-memory audio chunk store (cleared when call ends) ────────────────────
interface AudioChunk { index: number; senderId: string; data: string; ext: string; ts: number; }
const audioStore = new Map<string, AudioChunk[]>();   // callId → chunks
const audioIndexCounter = new Map<string, number>();  // callId → next sequential index

// Always use the counter for index — never chunks.length.
// After splice() pruning, chunks.length shrinks but the client's nextFetchIndex
// keeps advancing. Using chunks.length for new indices would produce duplicates
// that the client skips, causing a permanent "no incoming audio" black hole.
function getChunks(callId: string): AudioChunk[] {
  if (!audioStore.has(callId)) {
    audioStore.set(callId, []);
    audioIndexCounter.set(callId, 0);
  }
  return audioStore.get(callId)!;
}

function nextIndex(callId: string): number {
  const n = audioIndexCounter.get(callId) ?? 0;
  audioIndexCounter.set(callId, n + 1);
  return n;
}


async function getAuthorizedCall(callId: string, userId: string, res: Response) {
  const call = await db.query.callsTable.findFirst({ where: eq(callsTable.id, callId) });
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return null;
  }
  if (call.callerId !== userId && call.receiverId !== userId) {
    res.status(403).json({ error: "You can only access your own calls" });
    return null;
  }
  return call;
}

// Prune stores older than 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [id, chunks] of audioStore.entries()) {
    if (chunks.length === 0 || chunks[chunks.length - 1].ts < cutoff) {
      audioStore.delete(id);
      audioIndexCounter.delete(id);
    }
  }
}, 60_000);

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callerId = req.user!.userId;
    const { receiverId, callerName, callerInitials, callerColor, service, offer } = req.body;

    if (!receiverId || receiverId === callerId) {
      res.status(400).json({ error: "Valid receiverId is required" });
      return;
    }

    const receiver = await db.query.usersTable.findFirst({ where: eq(usersTable.id, receiverId) });
    if (!receiver || receiver.isBlocked || receiver.isDeactivated) {
      res.status(400).json({ error: "Receiver is not available for calls" });
      return;
    }

    const existingRinging = await db.query.callsTable.findFirst({
      where: and(eq(callsTable.callerId, callerId), eq(callsTable.status, "ringing")),
    });
    if (existingRinging) {
      await db.update(callsTable).set({ status: "ended", endedAt: new Date() }).where(eq(callsTable.id, existingRinging.id));
    }

    const call = {
      id: generateId(),
      callerId,
      callerName,
      callerInitials: callerInitials || "??",
      callerColor: callerColor || "#1A6EE0",
      receiverId,
      service: service || null,
      status: "ringing",
      offer: offer || null,
      callerCandidates: "[]",
      calleeCandidates: "[]",
    };

    await db.insert(callsTable).values(call);
    incomingCallCache.delete(receiverId);
    emitToUser(receiverId, "call:incoming", { call });
    res.json({ call });
  } catch (e) {
    logger.error({ err: e }, "call create error");
    res.status(500).json({ error: "Failed to initiate call" });
  }
});


router.get("/config", requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({
    provider: process.env.CALL_PROVIDER || "webrtc-ready",
    iceServers: [
      process.env.STUN_URL ? { urls: process.env.STUN_URL } : { urls: "stun:stun.l.google.com:19302" },
      ...(process.env.TURN_URL ? [{ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME || "", credential: process.env.TURN_CREDENTIAL || "" }] : []),
    ],
    audio: { preferredCodec: "opus", fallbackChunkMs: Number(process.env.CALL_FALLBACK_CHUNK_MS || 800) },
  });
});

router.get("/incoming", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const cached = incomingCallCache.get(userId);
    if (cached && Date.now() - cached.ts < 2500) { res.json(cached.payload); return; }
    const call = await db.query.callsTable.findFirst({
      where: and(eq(callsTable.receiverId, userId), eq(callsTable.status, "ringing")),
    });

    if (!call) {
      const payload = { call: null };
      incomingCallCache.set(userId, { ts: Date.now(), payload });
      res.json(payload);
      return;
    }

    const age = Date.now() - new Date(call.createdAt!).getTime();
    if (age > 35000) {
      await db.update(callsTable).set({ status: "ended", endedAt: new Date() }).where(eq(callsTable.id, call.id));
      const payload = { call: null };
      incomingCallCache.set(userId, { ts: Date.now(), payload });
      res.json(payload);
      return;
    }

    const payload = { call };
    incomingCallCache.set(userId, { ts: Date.now(), payload });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: "Failed to check incoming calls" });
  }
});

router.get("/:callId/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await getAuthorizedCall(req.params.callId as string, req.user!.userId, res);
    if (!call) return;
    res.json({ call });
  } catch (e) {
    res.status(500).json({ error: "Failed to get call status" });
  }
});

router.patch("/:callId/accept", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await getAuthorizedCall(req.params.callId as string, req.user!.userId, res);
    if (!call) return;
    if (call.receiverId !== req.user!.userId) {
      res.status(403).json({ error: "Only the receiver can accept this call" });
      return;
    }
    const { answer } = req.body;
    const updateData: Record<string, unknown> = { status: "active", startedAt: new Date() };
    if (answer) updateData.answer = answer;

    await db.update(callsTable).set(updateData).where(eq(callsTable.id, req.params.callId as string));
    const updatedCall = await db.query.callsTable.findFirst({ where: eq(callsTable.id, req.params.callId as string) });
    if (updatedCall) {
      incomingCallCache.delete(updatedCall.callerId); incomingCallCache.delete(updatedCall.receiverId);
      emitToUser(updatedCall.callerId, "call:accepted", { call: updatedCall });
      emitToUser(updatedCall.receiverId, "call:accepted", { call: updatedCall });
    }
    res.json({ call: updatedCall });
  } catch (e) {
    res.status(500).json({ error: "Failed to accept call" });
  }
});

router.patch("/:callId/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await getAuthorizedCall(req.params.callId as string, req.user!.userId, res);
    if (!call) return;
    if (call.receiverId !== req.user!.userId) {
      res.status(403).json({ error: "Only the receiver can reject this call" });
      return;
    }
    await db.update(callsTable).set({ status: "rejected", endedAt: new Date() }).where(eq(callsTable.id, req.params.callId as string));
    const updatedCall = await db.query.callsTable.findFirst({ where: eq(callsTable.id, req.params.callId as string) });
    if (updatedCall) {
      incomingCallCache.delete(updatedCall.callerId); incomingCallCache.delete(updatedCall.receiverId);
      emitToUser(updatedCall.callerId, "call:rejected", { call: updatedCall });
      emitToUser(updatedCall.receiverId, "call:rejected", { call: updatedCall });
    }
    res.json({ call: updatedCall, success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to reject call" });
  }
});

router.patch("/:callId/end", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await getAuthorizedCall(req.params.callId as string, req.user!.userId, res);
    if (!call) return;
    await db.update(callsTable).set({ status: "ended", endedAt: new Date() }).where(eq(callsTable.id, req.params.callId as string));
    const updatedCall = await db.query.callsTable.findFirst({ where: eq(callsTable.id, req.params.callId as string) });
    if (updatedCall) {
      incomingCallCache.delete(updatedCall.callerId); incomingCallCache.delete(updatedCall.receiverId);
      emitToUser(updatedCall.callerId, "call:ended", { call: updatedCall });
      emitToUser(updatedCall.receiverId, "call:ended", { call: updatedCall });
    }
    res.json({ call: updatedCall, success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to end call" });
  }
});

router.post("/:callId/ice-candidate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { candidate, role } = req.body;
    if (!candidate || !role) {
      res.status(400).json({ error: "candidate and role required" });
      return;
    }

    const call = await db.query.callsTable.findFirst({
      where: eq(callsTable.id, req.params.callId as string),
    });
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    if (call.callerId !== req.user!.userId && call.receiverId !== req.user!.userId) {
      res.status(403).json({ error: "You can only update your own calls" });
      return;
    }
    if ((role === "caller" && call.callerId !== req.user!.userId) || (role === "callee" && call.receiverId !== req.user!.userId)) {
      res.status(403).json({ error: "Invalid call role" });
      return;
    }

    if (role === "caller") {
      const existing = JSON.parse(call.callerCandidates || "[]");
      existing.push(candidate);
      await db.update(callsTable).set({ callerCandidates: JSON.stringify(existing) }).where(eq(callsTable.id, call.id));
    } else {
      const existing = JSON.parse(call.calleeCandidates || "[]");
      existing.push(candidate);
      await db.update(callsTable).set({ calleeCandidates: JSON.stringify(existing) }).where(eq(callsTable.id, call.id));
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to add ICE candidate" });
  }
});

// ── Audio chunk upload ────────────────────────────────────────────────────────
const ALLOWED_AUDIO_EXTS = new Set([".aac", ".wav", ".m4a", ".caf"]);
const MAX_CHUNK_B64_LEN = Number(process.env.MAX_CALL_AUDIO_CHUNK_B64 || 900_000); // supports low-bandwidth m4a/aac chunks

router.post("/:callId/audio", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = String(req.params.callId);
  const senderId = req.user!.userId;
  const { data, ext = ".aac" } = req.body || {};
  if (!data || typeof data !== "string") return res.status(400).json({ error: "Missing audio data" });
  if (data.length > MAX_CHUNK_B64_LEN) return res.status(413).json({ error: "Chunk too large" });
  const safeExt = String(ext).toLowerCase();
  if (!ALLOWED_AUDIO_EXTS.has(safeExt)) return res.status(400).json({ error: "Invalid audio format" });

  const call = await getAuthorizedCall(callId, senderId, res);
  if (!call) return;

  const chunks = getChunks(callId);
  const chunk: AudioChunk = { index: nextIndex(callId), senderId, data, ext: safeExt, ts: Date.now() };
  chunks.push(chunk);

  // Keep only last 30 chunks per call (~12 seconds).
  // Trimming does NOT affect the counter — indices stay sequential forever.
  if (chunks.length > 30) chunks.splice(0, chunks.length - 30);

  return res.json({ index: chunk.index });
});

// ── Audio chunk fetch ─────────────────────────────────────────────────────────
router.get("/:callId/audio", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = String(req.params.callId);
  const userId = req.user!.userId;
  const from = Number(req.query.from) || 0;

  const call = await getAuthorizedCall(callId, userId, res);
  if (!call) return;

  const chunks = getChunks(callId);
  const results = chunks.filter((c) => c.senderId !== userId && c.index >= from);

  // Never cache — audio chunks change every few hundred ms
  res.setHeader("Cache-Control", "no-store");
  return res.json({ chunks: results.map((c) => ({ index: c.index, data: c.data, ext: c.ext })) });
});

export default router;

