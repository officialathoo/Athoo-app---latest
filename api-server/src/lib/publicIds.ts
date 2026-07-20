import { createHash, randomUUID } from "node:crypto";

export function shortPublicId(prefix: string, rawId?: string | null): string {
  const seed = String(rawId || randomUUID()).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${prefix}-${seed.slice(-8).padStart(8, '0')}`;
}

export const publicIdPrefixes = {
  customer: 'CUS',
  provider: 'PRO',
  admin: 'ADM',
  booking: 'ATH-BKG',
  invoice: 'ATH-INV',
  complaint: 'ATH-CMP',
  chat: 'ATH-CHT',
  call: 'ATH-CAL',
  notification: 'ATH-NTF',
  service: 'ATH-SVC',
  action: 'ATH-ACT',
} as const;

export function publicUserId(role: string, rawId: string): string {
  const prefix = role === "provider"
    ? publicIdPrefixes.provider
    : role === "admin"
      ? publicIdPrefixes.admin
      : publicIdPrefixes.customer;
  // Hash the internal UUID instead of exposing part of it. Sixteen hexadecimal
  // characters provide a 64-bit public namespace while the database unique
  // index remains the final collision guard.
  const seed = createHash("sha256").update(`${role}:${rawId}`).digest("hex").slice(0, 16).toUpperCase();
  return `${prefix}-${seed}`;
}

export function chatPairKey(firstUserId: string, secondUserId: string): string {
  return [String(firstUserId), String(secondUserId)].sort().join(":");
}
