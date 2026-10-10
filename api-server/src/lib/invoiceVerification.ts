import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QRCode = require("qrcode-terminal/vendor/QRCode") as new (
  typeNumber: number,
  errorCorrectLevel: number,
) => {
  modules: boolean[][];
  addData(value: string): void;
  make(): void;
  getModuleCount(): number;
};
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel") as {
  M: number;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;
const INVOICE_NUMBER_PATTERN = /^ATH-[0-9]{6,12}$/;

function secret(): string {
  const value = String(process.env.INVOICE_VERIFICATION_SECRET || "").trim();
  if (value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("INVOICE_VERIFICATION_SECRET must be at least 32 characters in production");
  }
  const developmentFallback = String(process.env.JWT_SECRET || "athoo-development-invoice-verification-only");
  return crypto.createHash("sha256").update(developmentFallback).digest("hex");
}

function normalizeApiBaseUrl(): string {
  const configured = String(process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "https://api.athoo.pk")
    .trim()
    .replace(/\/+$/, "");
  try {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("PUBLIC_API_BASE_URL must use HTTPS in production");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    if (process.env.NODE_ENV === "production") throw new Error("PUBLIC_API_BASE_URL is invalid");
    return "http://localhost:3000";
  }
}

export function createInvoiceVerificationToken(invoiceNumber: string): string {
  const normalized = invoiceNumber.trim().toUpperCase();
  if (!INVOICE_NUMBER_PATTERN.test(normalized)) throw new Error("Invalid invoice number");
  return crypto.createHmac("sha256", secret()).update(`athoo-invoice:v1:${normalized}`).digest("base64url");
}

export function isValidInvoiceVerificationToken(invoiceNumber: string, token: unknown): boolean {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!TOKEN_PATTERN.test(normalizedToken)) return false;
  let expected: string;
  try {
    expected = createInvoiceVerificationToken(invoiceNumber);
  } catch {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(normalizedToken);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function buildInvoiceVerificationUrl(invoiceNumber: string): string {
  const normalized = invoiceNumber.trim().toUpperCase();
  const token = createInvoiceVerificationToken(normalized);
  return `${normalizeApiBaseUrl()}/api/invoices/verify/${encodeURIComponent(normalized)}?token=${encodeURIComponent(token)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char] || char);
}

export function createQrSvg(value: string, options?: { moduleSize?: number; margin?: number }): string {
  if (!value || value.length > 1024) throw new Error("QR value is invalid");
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(value);
  qr.make();
  const moduleSize = Math.max(2, Math.min(12, Math.trunc(options?.moduleSize || 5)));
  const margin = Math.max(4, Math.min(12, Math.trunc(options?.margin || 4)));
  const count = qr.getModuleCount();
  const side = (count + margin * 2) * moduleSize;
  const paths: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.modules[row]?.[col]) {
        paths.push(`M${(col + margin) * moduleSize} ${(row + margin) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" role="img" aria-label="${escapeXml("Athoo invoice verification QR code")}"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join("")}" fill="#0F172A"/></svg>`;
}

export function createQrSvgDataUri(value: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(createQrSvg(value), "utf8").toString("base64")}`;
}

export function invoiceVerificationPayload(invoiceNumber: string): {
  verificationUrl: string;
  qrCodeDataUri: string;
} {
  const verificationUrl = buildInvoiceVerificationUrl(invoiceNumber);
  return { verificationUrl, qrCodeDataUri: createQrSvgDataUri(verificationUrl) };
}
