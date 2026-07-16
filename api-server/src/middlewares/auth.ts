import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hasAdminPermission } from "../lib/adminPermissions";
import { recordUserActivity } from "../lib/inactivityLifecycle";

const jwtSecret = process.env["JWT_SECRET"];
if (!jwtSecret) throw new Error("FATAL: JWT_SECRET environment variable is required.");
const JWT_SECRET: string = jwtSecret;
const JWT_ISSUER = process.env["JWT_ISSUER"] || "athoo-api";
const JWT_AUDIENCE = process.env["JWT_AUDIENCE"] || "athoo-clients";

export interface JwtPayload {
  userId: string;
  role: string;
  sessionId?: string;
  tokenType?: "access" | "purpose";
  purpose?: string;
  adminRole?: string;
  adminPermissions?: string[];
  deviceId?: string;
}
export interface AuthRequest extends Omit<Request, "params"> {
  user?: JwtPayload;
  params: { [key: string]: string };
}

export function signToken(payload: JwtPayload, expiresIn = "15m"): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as any, issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
}

export function signAccessToken(user: any, sessionId: string): string {
  return signToken({
    userId: user.id, role: user.role, sessionId, tokenType: "access",
    adminRole: user.adminRole ?? undefined,
    adminPermissions: Array.isArray(user.adminPermissions) ? user.adminPermissions : [],
  }, "15m");
}

export function signPurposeToken(payload: Omit<JwtPayload, "tokenType">, expiresIn = "2m") {
  return signToken({ ...payload, tokenType: "purpose" }, expiresIn);
}

export function verifyToken(token: string): JwtPayload | null {
  try { return jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }) as unknown as JwtPayload; } catch { return null; }
}

export async function verifyActivePurposeToken(token: string, purpose: string): Promise<JwtPayload | null> {
  const decoded = verifyToken(token);
  if (!decoded || decoded.tokenType !== "purpose" || decoded.purpose !== purpose || !decoded.sessionId) return null;
  const { isSessionActive } = await import("../lib/session");
  if (!(await isSessionActive(decoded.sessionId, decoded.userId, decoded.deviceId))) return null;
  const user = await loadUserFromToken(decoded);
  if (accountError(user)) return null;
  return { userId: user!.id, role: user!.role, sessionId: decoded.sessionId, tokenType: "purpose", purpose, adminRole: user!.adminRole ?? undefined, adminPermissions: Array.isArray(user!.adminPermissions) ? user!.adminPermissions as string[] : [] };
}

export async function verifyActiveAccessToken(token: string, deviceId?: unknown): Promise<JwtPayload | null> {
  const decoded = verifyToken(token);
  if (!decoded || decoded.tokenType !== "access" || !decoded.sessionId) return null;
  const { isSessionActive } = await import("../lib/session");
  if (!(await isSessionActive(decoded.sessionId, decoded.userId, deviceId))) return null;
  const user = await loadUserFromToken(decoded);
  if (accountError(user)) return null;
  return {
    userId: user!.id,
    role: user!.role,
    sessionId: decoded.sessionId,
    tokenType: "access",
    adminRole: user!.adminRole ?? undefined,
    adminPermissions: Array.isArray(user!.adminPermissions) ? user!.adminPermissions as string[] : [],
  };
}

async function loadUserFromToken(decoded: JwtPayload) {
  return db.query.usersTable.findFirst({ where: eq(usersTable.id, decoded.userId) });
}
function accountError(user: any, opts?: { allowDeactivated?: boolean }) {
  if (!user) return { status: 401, error: "Account not found" };
  if (user.isDeactivated && !opts?.allowDeactivated) return { status: 403, error: "This account has been deactivated. Please contact support." };
  if (user.isBlocked) return { status: 403, error: user.blockedReason || "This account has been blocked. Please contact support." };
  if (user.accountStatus === "deleted") return { status: 403, error: "This account is no longer available." };
  return null;
}
function buildAuthMiddleware(opts: { allowDeactivated?: boolean } = {}) {
  return async function (req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return void res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }) as unknown as JwtPayload;
      if (decoded.tokenType !== "access" || !decoded.sessionId) return void res.status(401).json({ error: "Invalid token type" });
      const { isSessionActive } = await import("../lib/session");
      if (!(await isSessionActive(decoded.sessionId, decoded.userId, req.headers["x-athoo-device-id"]))) {
        return void res.status(401).json({ error: "Session expired or replaced by a newer login", code: "SESSION_REVOKED" });
      }
      const user = await loadUserFromToken(decoded);
      const error = accountError(user, opts);
      if (error) return void res.status(error.status).json({ error: error.error });
      req.user = { userId: user!.id, role: user!.role, sessionId: decoded.sessionId, tokenType: "access", adminRole: user!.adminRole ?? undefined, adminPermissions: Array.isArray(user!.adminPermissions) ? user!.adminPermissions as string[] : [] };
      void recordUserActivity(user!).catch(() => undefined);
      next();
    } catch { return void res.status(401).json({ error: "Invalid or expired token" }); }
  };
}
export const requireAuth = buildAuthMiddleware();
export const requireAuthAllowDeactivated = buildAuthMiddleware({ allowDeactivated: true });
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return void res.status(401).json({ error: "Unauthorized" });
  if (req.user.role !== "admin") return void res.status(403).json({ error: "Admin only" });
  next();
}
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return void res.status(401).json({ error: "Unauthorized" });
  if (req.user.role !== "admin") return void res.status(403).json({ error: "Admin only" });
  if (req.user.adminRole !== "super_admin") return void res.status(403).json({ error: "Super admin access required" });
  next();
}
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return void res.status(401).json({ error: "Unauthorized" });
    if (req.user.role !== "admin") return void res.status(403).json({ error: "Admin only" });
    if (!hasAdminPermission(req.user, permission)) {
      return void res.status(403).json({ error: `Permission required: ${permission}` });
    }
    next();
  };
}
