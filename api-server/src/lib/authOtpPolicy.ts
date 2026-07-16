import crypto from "crypto";

export type OtpPurpose = "login" | "registration" | "password_reset";
export type AppAccountRole = "customer" | "provider";

export type AccountAvailability = {
  status: number;
  code: string;
  error: string;
};

export type AuthAccountSnapshot = {
  role?: string | null;
  isDeactivated?: boolean | null;
  isBlocked?: boolean | null;
  accountStatus?: string | null;
};

export function cleanOtpPurpose(value: unknown): OtpPurpose | null {
  if (value === "login" || value === "registration" || value === "password_reset") return value;
  return null;
}

export function accountUnavailableResponse(
  user: AuthAccountSnapshot | null | undefined,
  expectedRole?: AppAccountRole | null,
): AccountAvailability | null {
  if (!user) {
    return { status: 404, code: "ACCOUNT_NOT_FOUND", error: "No active Athoo account was found with this phone number." };
  }
  if (expectedRole && user.role !== expectedRole) {
    const actualRole = user.role === "provider" ? "provider" : "customer";
    return {
      status: 409,
      code: "ACCOUNT_ROLE_MISMATCH",
      error: `This phone number is registered as a ${actualRole}. Please choose ${actualRole === "provider" ? "Provider" : "Customer"} sign in.`,
    };
  }
  if (user.accountStatus === "deleted") {
    return { status: 410, code: "ACCOUNT_DELETED", error: "This account has been deleted and cannot be used to sign in." };
  }
  if (user.accountStatus === "pending_deletion") {
    return { status: 403, code: "ACCOUNT_PENDING_DELETION", error: "This account is scheduled for deletion. Please contact Athoo Support to restore access." };
  }
  if (user.isDeactivated || user.accountStatus === "deactivated") {
    return { status: 403, code: "ACCOUNT_DEACTIVATED", error: "This account has been deactivated. Please contact Athoo Support." };
  }
  if (user.isBlocked) {
    return { status: 403, code: "ACCOUNT_BLOCKED", error: "This account is blocked. Please contact Athoo Support." };
  }
  if (user.accountStatus && user.accountStatus !== "active") {
    return { status: 403, code: "ACCOUNT_UNAVAILABLE", error: "This account is not available for sign in. Please contact Athoo Support." };
  }
  return null;
}

export function otpHashMatches(storedHash: string, candidateHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(storedHash) || !/^[a-f0-9]{64}$/i.test(candidateHash)) return false;
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}
