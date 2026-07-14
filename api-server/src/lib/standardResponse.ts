import type { Response } from "express";

export function ok<T>(res: Response, data: T, message = "OK") {
  return res.json({ success: true, message, data, error: null });
}

export function fail(res: Response, status: number, message: string, code = "APP_ERROR", details: unknown = null) {
  return res.status(status).json({ success: false, message, data: null, error: { code, details } });
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again.") {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (/password/i.test(raw)) return "Incorrect password. Please try again.";
  if (/otp/i.test(raw)) return "Invalid or expired OTP. Please request a new code.";
  if (/network|fetch|timeout/i.test(raw)) return "Network issue. Please check your internet connection.";
  if (/permission/i.test(raw)) return "Permission is required to continue.";
  if (/expired/i.test(raw)) return "This request has expired. Please try again.";
  if (/active job|busy/i.test(raw)) return "You already have an active job. Please complete it before starting another.";
  return fallback;
}
