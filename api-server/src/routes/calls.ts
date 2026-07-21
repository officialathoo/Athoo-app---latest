import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { callsTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, inArray, desc, gte, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { emitToUser } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { Response } from "express";
import { getRuntimeCallConfiguration } from "../lib/callConfiguration";

const router = Router();
const incomingCallCache = new Map<string, { ts: number; payload: any }>();

function generateId(): string {
  return crypto.randomUUID();
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function configuredBrandName(): string {
  return String(process.env.APP_DISPLAY_NAME || process.env.BRAND_DISPLAY_NAME || "Athoo").trim() || "Athoo";
}

function configuredBrandColor(): string {
  const value = String(process.env.BRAND_PRIMARY_COLOR || "#1A6EE0").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : "#1A6EE0";
}

const LIVE_CALL_STATUSES = ["ringing", "active"] as const;
const MAX_SESSION_DESCRIPTION_LENGTH = 160_000;
const MAX_ICE_CANDIDATE_LENGTH = 8_000;
const MAX_ICE_CANDIDATES_PER_SIDE = 128;
const RINGING_CALL_TTL_MS = 35_000;

class CallRouteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function boundedText(value: unknown, limit: number): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizedSessionDescription(value: unknown, expectedType: "offer" | "answer"): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw.length > MAX_SESSION_DESCRIPTION_LENGTH) {
    throw new CallRouteError(413, `${expectedType === "offer" ? "Call offer" : "Call answer"} is too large`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CallRouteError(400, `Invalid WebRTC ${expectedType}`);
  }
  if (!parsed || typeof parsed !== "object") throw new CallRouteError(400, `Invalid WebRTC ${expectedType}`);
  const record = parsed as Record<string, unknown>;
  const type = String(record.type || "").trim().toLowerCase();
  const sdp = typeof record.sdp === "string" ? record.sdp : "";
  if (type !== expectedType || !sdp || sdp.length > MAX_SESSION_DESCRIPTION_LENGTH) {
    throw new CallRouteError(400, `Invalid WebRTC ${expectedType}`);
  }
  return JSON.stringify({ type, sdp });
}

type NormalizedIceCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

function normalizeIceCandidate(value: unknown): NormalizedIceCandidate {
  if (!value || typeof value !== "object") throw new CallRouteError(400, "A valid ICE candidate is required");
  const record = value as Record<string, unknown>;
  const candidate = String(record.candidate || "").trim();
  if (!candidate || candidate.length > MAX_ICE_CANDIDATE_LENGTH || !candidate.startsWith("candidate:")) {
    throw new CallRouteError(400, "A valid ICE candidate is required");
  }
  const sdpMid = record.sdpMid === null || record.sdpMid === undefined
    ? null
    : String(record.sdpMid).trim().slice(0, 64);
  const parsedIndex = record.sdpMLineIndex === null || record.sdpMLineIndex === undefined
    ? null
    : Number(record.sdpMLineIndex);
  if (parsedIndex !== null && (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex > 64)) {
    throw new CallRouteError(400, "Invalid ICE media-line index");
  }
  const usernameFragment = record.usernameFragment === null || record.usernameFragment === undefined
    ? null
    : String(record.usernameFragment).trim().slice(0, 256);
  return {
    candidate,
    sdpMid,
    sdpMLineIndex: parsedIndex,
    usernameFragment,
  };
}

function safeCandidateArray(value: string | null | undefined): NormalizedIceCandidate[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function callInvolvesUser(call: { callerId: string; receiverId: string }, userId: string): boolean {
  return call.callerId === userId || call.receiverId === userId;
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

function clearCallAudio(callId: string): void {
  audioStore.delete(callId);
  audioIndexCounter.delete(callId);
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
  for (const [userId, cached] of incomingCallCache.entries()) {
    if (cached.ts < cutoff) incomingCallCache.delete(userId);
  }
}, 60_000);

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callerId = req.user!.userId;
    const receiverId = String(req.body?.receiverId || "").trim();
    if (!receiverId || receiverId === callerId) {
      res.status(400).json({ error: "Valid receiverId is required" });
      return;
    }

    const service = boundedText(req.body?.service, 120) || null;
    const offer = normalizedSessionDescription(req.body?.offer, "offer");
    const participantIds = [callerId, receiverId].sort();
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      // Serialize call creation per participant. Two devices dialing at the same
      // moment must not create overlapping ringing sessions or race the busy check.
      for (const participantId of participantIds) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`athoo-call:${participantId}`}, 0))`);
      }

      const participants = await tx.select({
        id: usersTable.id,
        role: usersTable.role,
        name: usersTable.name,
        profileColor: usersTable.profileColor,
        isBlocked: usersTable.isBlocked,
        isDeactivated: usersTable.isDeactivated,
        accountStatus: usersTable.accountStatus,
      }).from(usersTable).where(inArray(usersTable.id, participantIds));
      const caller = participants.find((participant) => participant.id === callerId);
      const receiver = participants.find((participant) => participant.id === receiverId);

      if (!caller || caller.isBlocked || caller.isDeactivated || caller.accountStatus === "deleted") {
        throw new CallRouteError(403, "Caller account is not eligible to place calls");
      }
      if (!receiver || receiver.isBlocked || receiver.isDeactivated || receiver.accountStatus === "deleted") {
        throw new CallRouteError(400, "Receiver is not available for calls");
      }
      const validRolePair = new Set([caller.role, receiver.role]);
      if (validRolePair.size !== 2 || !validRolePair.has("customer") || !validRolePair.has("provider")) {
        throw new CallRouteError(403, "Calls are available only between customers and service providers");
      }

      const liveCalls = await tx.select().from(callsTable).where(and(
        inArray(callsTable.status, [...LIVE_CALL_STATUSES]),
        or(
          inArray(callsTable.callerId, participantIds),
          inArray(callsTable.receiverId, participantIds),
        ),
      )).orderBy(desc(callsTable.createdAt)).limit(20);

      const usableCalls = [] as typeof liveCalls;
      for (const existing of liveCalls) {
        const createdAt = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
        if (existing.status === "ringing" && (!createdAt || now.getTime() - createdAt > RINGING_CALL_TTL_MS)) {
          await tx.update(callsTable).set({ status: "ended", endedAt: now }).where(and(
            eq(callsTable.id, existing.id),
            eq(callsTable.status, "ringing"),
          ));
          clearCallAudio(existing.id);
          continue;
        }
        usableCalls.push(existing);
      }

      const samePendingCall = usableCalls.find((existing) =>
        existing.status === "ringing" &&
        existing.callerId === callerId &&
        existing.receiverId === receiverId
      );
      if (samePendingCall) {
        if (offer && offer !== samePendingCall.offer) {
          const [refreshedCall] = await tx.update(callsTable).set({
            offer,
            answer: null,
            callerCandidates: "[]",
            calleeCandidates: "[]",
          }).where(and(
            eq(callsTable.id, samePendingCall.id),
            eq(callsTable.status, "ringing"),
            eq(callsTable.callerId, callerId),
          )).returning();
          if (refreshedCall) return { call: refreshedCall, created: false, signalingRefreshed: true };
        }
        return { call: samePendingCall, created: false, signalingRefreshed: false };
      }

      const callerBusy = usableCalls.find((existing) => callInvolvesUser(existing, callerId));
      if (callerBusy?.status === "active" || callerBusy?.receiverId === callerId) {
        throw new CallRouteError(409, "You are already in another call");
      }
      // Starting a new outgoing call intentionally replaces the caller's older
      // unanswered outgoing attempt, but never interrupts an incoming or active call.
      for (const existing of usableCalls.filter((candidate) =>
        candidate.status === "ringing" && candidate.callerId === callerId
      )) {
        await tx.update(callsTable).set({ status: "ended", endedAt: now }).where(and(
          eq(callsTable.id, existing.id),
          eq(callsTable.status, "ringing"),
        ));
        clearCallAudio(existing.id);
      }

      const receiverBusy = usableCalls.find((existing) => callInvolvesUser(existing, receiverId));
      if (receiverBusy) throw new CallRouteError(409, "The other person is already on another call");

      const callerName = boundedText(caller.name, 120) || "Athoo user";
      const callerInitials = callerName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "AU";
      const [createdCall] = await tx.insert(callsTable).values({
        id: generateId(),
        callerId,
        callerName,
        callerInitials,
        callerColor: /^#[0-9A-Fa-f]{6}$/.test(String(caller.profileColor || ""))
          ? String(caller.profileColor).toUpperCase()
          : configuredBrandColor(),
        receiverId,
        service,
        status: "ringing",
        offer,
        callerCandidates: "[]",
        calleeCandidates: "[]",
      }).returning();
      if (!createdCall) throw new Error("Call record was not created");
      return { call: createdCall, created: true, signalingRefreshed: false };
    });

    const call = result.call;
    incomingCallCache.delete(receiverId);
    if (result.created || result.signalingRefreshed) {
      emitToUser(receiverId, "call:incoming", { call, signalingRefreshed: result.signalingRefreshed });
    }
    if (result.created) {
      // WebSocket is the fastest path while the app is open. The push-backed
      // notification is the recovery path when the app is backgrounded or killed.
      const brandName = configuredBrandName();
      void notifyUser({
        userId: receiverId,
        title: `Incoming ${brandName} call`,
        body: `${call.callerName || `A ${brandName} user`} is calling${service ? ` about ${service}` : ""}.`,
        type: "call",
        link: "/call",
        data: {
          callId: call.id,
          callerId,
          role: req.user!.role === "customer" ? "provider" : "customer",
          expiresAt: new Date(Date.now() + RINGING_CALL_TTL_MS).toISOString(),
        },
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.status(result.created ? 201 : 200).json({ call, reused: !result.created });
  } catch (error) {
    if (error instanceof CallRouteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "call create error");
    res.status(500).json({ error: "Failed to initiate call" });
  }
});


router.get("/config", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const configuration = await getRuntimeCallConfiguration(req.user!.userId);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      ...configuration,
      warning: configuration.warning,
      audio: {
        preferredCodec: process.env.CALL_PREFERRED_CODEC || "opus",
        fallbackChunkMs: boundedInteger(process.env.CALL_FALLBACK_CHUNK_MS, 800, 400, 2_000),
        fallbackActivationMs: boundedInteger(process.env.CALL_FALLBACK_ACTIVATION_MS, 8_000, 7_000, 20_000),
      },
    });
  } catch (error) {
    logger.warn({ err: error, userId: req.user!.userId }, "call configuration error");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(503).json({ error: "Secure call configuration is temporarily unavailable" });
  }
});

router.get("/incoming", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const cached = incomingCallCache.get(userId);
    res.setHeader("Cache-Control", "private, no-store");
    if (cached && Date.now() - cached.ts < 2500) { res.json(cached.payload); return; }
    const call = await db.query.callsTable.findFirst({
      where: and(eq(callsTable.receiverId, userId), eq(callsTable.status, "ringing")),
      orderBy: [desc(callsTable.createdAt)],
    });

    if (!call) {
      const payload = { call: null };
      incomingCallCache.set(userId, { ts: Date.now(), payload });
      res.json(payload);
      return;
    }

    const age = Date.now() - new Date(call.createdAt!).getTime();
    if (age > RINGING_CALL_TTL_MS) {
      await db.update(callsTable).set({ status: "ended", endedAt: new Date() }).where(and(
        eq(callsTable.id, call.id),
        eq(callsTable.status, "ringing"),
      ));
      clearCallAudio(call.id);
      const payload = { call: null };
      incomingCallCache.set(userId, { ts: Date.now(), payload });
      res.json(payload);
      return;
    }

    const payload = { call };
    incomingCallCache.set(userId, { ts: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    logger.warn({ err: error, userId: req.user!.userId }, "incoming call lookup error");
    res.status(500).json({ error: "Failed to check incoming calls" });
  }
});

router.get("/:callId/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const call = await getAuthorizedCall(req.params.callId as string, req.user!.userId, res);
    if (!call) return;
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ call });
  } catch (error) {
    logger.warn({ err: error, userId: req.user!.userId, callId: req.params.callId }, "call status lookup error");
    res.status(500).json({ error: "Failed to get call status" });
  }
});

router.patch("/:callId/accept", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callId = String(req.params.callId);
    const receiverId = req.user!.userId;
    const answer = normalizedSessionDescription(req.body?.answer, "answer");
    const startedAt = new Date();
    const [updatedCall] = await db.update(callsTable).set({
      status: "active",
      startedAt,
      ...(answer ? { answer } : {}),
    }).where(and(
      eq(callsTable.id, callId),
      eq(callsTable.receiverId, receiverId),
      eq(callsTable.status, "ringing"),
      gte(callsTable.createdAt, new Date(Date.now() - RINGING_CALL_TTL_MS)),
    )).returning();

    if (!updatedCall) {
      const current = await getAuthorizedCall(callId, receiverId, res);
      if (!current) return;
      if (current.receiverId !== receiverId) {
        res.status(403).json({ error: "Only the receiver can accept this call" });
        return;
      }
      // A network retry after a successful acceptance is idempotent and must
      // preserve the original startedAt used by both call timers.
      if (current.status === "active") {
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ call: current, reused: true });
        return;
      }
      const createdAt = current.createdAt ? new Date(current.createdAt).getTime() : 0;
      if (current.status === "ringing" && (!createdAt || Date.now() - createdAt > RINGING_CALL_TTL_MS)) {
        await db.update(callsTable).set({ status: "ended", endedAt: new Date() }).where(and(
          eq(callsTable.id, callId),
          eq(callsTable.status, "ringing"),
        ));
        incomingCallCache.delete(current.callerId);
        incomingCallCache.delete(current.receiverId);
        res.status(410).json({ error: "This call has expired" });
        return;
      }
      res.status(409).json({ error: `Call is already ${current.status}` });
      return;
    }

    incomingCallCache.delete(updatedCall.callerId);
    incomingCallCache.delete(updatedCall.receiverId);
    emitToUser(updatedCall.callerId, "call:accepted", { call: updatedCall });
    emitToUser(updatedCall.receiverId, "call:accepted", { call: updatedCall });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ call: updatedCall, reused: false });
  } catch (error) {
    if (error instanceof CallRouteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "call accept error");
    res.status(500).json({ error: "Failed to accept call" });
  }
});

router.patch("/:callId/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callId = String(req.params.callId);
    const receiverId = req.user!.userId;
    const [updatedCall] = await db.update(callsTable).set({ status: "rejected", endedAt: new Date() }).where(and(
      eq(callsTable.id, callId),
      eq(callsTable.receiverId, receiverId),
      eq(callsTable.status, "ringing"),
    )).returning();

    if (!updatedCall) {
      const current = await getAuthorizedCall(callId, receiverId, res);
      if (!current) return;
      if (current.receiverId !== receiverId) {
        res.status(403).json({ error: "Only the receiver can reject this call" });
        return;
      }
      if (current.status === "rejected" || current.status === "ended") {
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ call: current, success: true, reused: true });
        return;
      }
      res.status(409).json({ error: `Call is already ${current.status}` });
      return;
    }

    clearCallAudio(callId);
    incomingCallCache.delete(updatedCall.callerId);
    incomingCallCache.delete(updatedCall.receiverId);
    emitToUser(updatedCall.callerId, "call:rejected", { call: updatedCall });
    emitToUser(updatedCall.receiverId, "call:rejected", { call: updatedCall });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ call: updatedCall, success: true, reused: false });
  } catch (error) {
    logger.error({ err: error }, "call reject error");
    res.status(500).json({ error: "Failed to reject call" });
  }
});

router.patch("/:callId/end", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callId = String(req.params.callId);
    const userId = req.user!.userId;
    const [updatedCall] = await db.update(callsTable).set({ status: "ended", endedAt: new Date() }).where(and(
      eq(callsTable.id, callId),
      or(eq(callsTable.callerId, userId), eq(callsTable.receiverId, userId)),
      inArray(callsTable.status, [...LIVE_CALL_STATUSES]),
    )).returning();

    if (!updatedCall) {
      const current = await getAuthorizedCall(callId, userId, res);
      if (!current) return;
      if (current.status === "ended" || current.status === "rejected") {
        clearCallAudio(callId);
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ call: current, success: true, reused: true });
        return;
      }
      res.status(409).json({ error: `Call cannot be ended from status ${current.status}` });
      return;
    }

    clearCallAudio(callId);
    incomingCallCache.delete(updatedCall.callerId);
    incomingCallCache.delete(updatedCall.receiverId);
    emitToUser(updatedCall.callerId, "call:ended", { call: updatedCall });
    emitToUser(updatedCall.receiverId, "call:ended", { call: updatedCall });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ call: updatedCall, success: true, reused: false });
  } catch (error) {
    logger.error({ err: error }, "call end error");
    res.status(500).json({ error: "Failed to end call" });
  }
});

router.post("/:callId/ice-candidate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const callId = String(req.params.callId);
    const userId = req.user!.userId;
    const role = String(req.body?.role || "") as "caller" | "callee";
    if (role !== "caller" && role !== "callee") {
      res.status(400).json({ error: "A valid call role is required" });
      return;
    }
    const candidate = normalizeIceCandidate(req.body?.candidate);
    const candidateJson = JSON.stringify(candidate);

    const call = await db.query.callsTable.findFirst({ where: eq(callsTable.id, callId) });
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    if (!callInvolvesUser(call, userId)) {
      res.status(403).json({ error: "You can only update your own calls" });
      return;
    }
    if (!LIVE_CALL_STATUSES.includes(call.status as (typeof LIVE_CALL_STATUSES)[number])) {
      res.status(409).json({ error: "Call is no longer accepting ICE candidates" });
      return;
    }
    if ((role === "caller" && call.callerId !== userId) || (role === "callee" && call.receiverId !== userId)) {
      res.status(403).json({ error: "Invalid call role" });
      return;
    }

    const currentCandidates = safeCandidateArray(role === "caller" ? call.callerCandidates : call.calleeCandidates);
    const duplicate = currentCandidates.some((existing) => JSON.stringify(existing) === candidateJson);
    if (currentCandidates.length >= MAX_ICE_CANDIDATES_PER_SIDE && !duplicate) {
      res.status(413).json({ error: "Too many ICE candidates" });
      return;
    }

    const candidateColumn = role === "caller" ? callsTable.callerCandidates : callsTable.calleeCandidates;
    const currentJson = sql`COALESCE(NULLIF(${candidateColumn}, ''), '[]')::jsonb`;
    const containsCandidate = sql`${currentJson} @> jsonb_build_array(${candidateJson}::jsonb)`;
    const hasCapacity = sql`jsonb_array_length(${currentJson}) < ${MAX_ICE_CANDIDATES_PER_SIDE}`;
    const nextValue = sql<string>`CASE
      WHEN ${containsCandidate} THEN ${candidateColumn}
      ELSE (${currentJson} || jsonb_build_array(${candidateJson}::jsonb))::text
    END`;

    const updateWhere = and(
      eq(callsTable.id, callId),
      role === "caller" ? eq(callsTable.callerId, userId) : eq(callsTable.receiverId, userId),
      inArray(callsTable.status, [...LIVE_CALL_STATUSES]),
      or(containsCandidate, hasCapacity),
    );
    const returningIdentity = {
      callerId: callsTable.callerId,
      receiverId: callsTable.receiverId,
      status: callsTable.status,
    };
    const [updatedCall] = role === "caller"
      ? await db.update(callsTable).set({ callerCandidates: nextValue }).where(updateWhere).returning(returningIdentity)
      : await db.update(callsTable).set({ calleeCandidates: nextValue }).where(updateWhere).returning(returningIdentity);

    if (!updatedCall) {
      const latest = await db.query.callsTable.findFirst({ where: eq(callsTable.id, callId) });
      if (!latest || !LIVE_CALL_STATUSES.includes(latest.status as (typeof LIVE_CALL_STATUSES)[number])) {
        res.status(409).json({ error: "Call is no longer accepting ICE candidates" });
        return;
      }
      res.status(413).json({ error: "Too many ICE candidates" });
      return;
    }

    const remoteUserId = role === "caller" ? updatedCall.receiverId : updatedCall.callerId;
    emitToUser(remoteUserId, "call:ice-candidate", { callId, candidate, role });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Athoo-Ice-Duplicate", duplicate ? "true" : "false");
    res.json({ success: true });
    return;
  } catch (error) {
    if (error instanceof CallRouteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "call ICE candidate error");
    res.status(500).json({ error: "Failed to add ICE candidate" });
    return;
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

  if (call.status !== "active") return res.status(409).json({ error: "Call is not active" });

  const chunks = getChunks(callId);
  const chunk: AudioChunk = { index: nextIndex(callId), senderId, data, ext: safeExt, ts: Date.now() };
  chunks.push(chunk);

  // Keep only a small recent window. Older chunks are useless for a live call and create audible backlog.
  // Trimming does NOT affect the counter — indices stay sequential forever.
  if (chunks.length > 12) chunks.splice(0, chunks.length - 12);

  return res.json({ index: chunk.index });
});

// ── Audio chunk fetch ─────────────────────────────────────────────────────────
router.get("/:callId/audio", requireAuth, async (req: AuthRequest, res: Response) => {
  const callId = String(req.params.callId);
  const userId = req.user!.userId;
  const from = Number(req.query.from) || 0;

  const call = await getAuthorizedCall(callId, userId, res);
  if (!call) return;
  if (call.status !== "active") return res.status(409).json({ error: "Call is not active" });

  const chunks = getChunks(callId);
  const results = chunks.filter((c) => c.senderId !== userId && c.index >= from);

  // Never cache — audio chunks change every few hundred ms
  res.setHeader("Cache-Control", "no-store");
  return res.json({ chunks: results.map((c) => ({ index: c.index, data: c.data, ext: c.ext, ts: c.ts })), serverTime: Date.now() });
});

export default router;

