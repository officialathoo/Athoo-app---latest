import { randomUUID } from "node:crypto";

export function shortPublicId(prefix: string, rawId?: string | null): string {
  const seed = String(rawId || randomUUID()).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${prefix}-${seed.slice(-8).padStart(8, '0')}`;
}

export const publicIdPrefixes = {
  customer: 'CUS',
  provider: 'PRO',
  booking: 'ATH-BKG',
  invoice: 'ATH-INV',
  complaint: 'ATH-CMP',
  chat: 'ATH-CHT',
  call: 'ATH-CAL',
  notification: 'ATH-NTF',
  service: 'ATH-SVC',
  action: 'ATH-ACT',
} as const;
