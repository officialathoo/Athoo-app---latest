import nodemailer from "nodemailer";
import SMTPPool from "nodemailer/lib/smtp-pool";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { logger } from "./logger";

export type EmailProviderKind = "smtp" | "console" | "disabled";

export interface EmailProviderStatus {
  provider: EmailProviderKind;
  configuredProvider: string;
  configured: boolean;
  hostConfigured: boolean;
  userConfigured: boolean;
  passwordConfigured: boolean;
  fromConfigured: boolean;
  port: number;
  secure: boolean;
  requireTls: boolean;
  pooled: boolean;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  ok: boolean;
  channel: EmailProviderKind;
  provider: string;
  messageId?: string;
  response?: string;
  errorCode?: string;
}

let transporter: nodemailer.Transporter | null = null;
let transporterFingerprint = "";
let missingConfigurationLogged = false;

function env(name: string, fallback = ""): string {
  return String(process.env[name] ?? fallback).trim();
}

function envBool(name: string, fallback = false): boolean {
  const raw = env(name);
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

function resolveProvider(): EmailProviderKind {
  const configured = env("EMAIL_PROVIDER", "smtp").toLowerCase();
  if (["disabled", "off", "none"].includes(configured)) return "disabled";
  if (configured === "console") return "console";
  // Any SMTP-compatible vendor name (zoho_smtp, ses_smtp, postmark_smtp, etc.)
  // intentionally resolves to the provider-neutral SMTP adapter.
  return "smtp";
}

function getSmtpConfig() {
  const host = env("SMTP_HOST");
  const port = envInt("SMTP_PORT", 587, 1, 65535);
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const fromName = env("EMAIL_FROM_NAME", "Athoo");
  const fromEmail = env("EMAIL_FROM_ADDRESS", env("SMTP_FROM", env("EMAIL_FROM", user)));
  const replyTo = env("EMAIL_REPLY_TO");
  const secure = envBool("SMTP_SECURE", port === 465) || port === 465;
  const requireTLS = envBool("SMTP_REQUIRE_TLS", port === 587);
  const rejectUnauthorized = envBool("SMTP_TLS_REJECT_UNAUTHORIZED", true);
  const pool = envBool("SMTP_POOL", true);
  return {
    host,
    port,
    user,
    pass,
    fromName,
    fromEmail,
    replyTo,
    secure,
    requireTLS,
    rejectUnauthorized,
    pool,
    maxConnections: envInt("SMTP_MAX_CONNECTIONS", 3, 1, 20),
    maxMessages: envInt("SMTP_MAX_MESSAGES_PER_CONNECTION", 100, 1, 1000),
    connectionTimeout: envInt("SMTP_CONNECTION_TIMEOUT_MS", 10_000, 1000, 120_000),
    greetingTimeout: envInt("SMTP_GREETING_TIMEOUT_MS", 10_000, 1000, 120_000),
    socketTimeout: envInt("SMTP_SOCKET_TIMEOUT_MS", 20_000, 1000, 180_000),
  };
}

export function getEmailConfigurationStatus(): EmailProviderStatus {
  const provider = resolveProvider();
  const smtp = getSmtpConfig();
  const smtpConfigured = Boolean(smtp.host && smtp.port && smtp.user && smtp.pass && smtp.fromEmail);
  return {
    provider,
    configuredProvider: env("EMAIL_PROVIDER", "smtp"),
    configured: provider === "console" || (provider === "smtp" && smtpConfigured),
    hostConfigured: Boolean(smtp.host),
    userConfigured: Boolean(smtp.user),
    passwordConfigured: Boolean(smtp.pass),
    fromConfigured: Boolean(smtp.fromEmail),
    port: smtp.port,
    secure: smtp.secure,
    requireTls: smtp.requireTLS,
    pooled: smtp.pool,
  };
}

function getTransport(): nodemailer.Transporter | null {
  if (resolveProvider() !== "smtp") return null;
  const smtp = getSmtpConfig();
  const status = getEmailConfigurationStatus();
  if (!status.configured) {
    if (!missingConfigurationLogged) {
      missingConfigurationLogged = true;
      logger.warn(status, "SMTP email delivery is not fully configured");
    }
    return null;
  }

  const fingerprint = JSON.stringify({
    host: smtp.host,
    port: smtp.port,
    user: smtp.user,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    pool: smtp.pool,
    maxConnections: smtp.maxConnections,
    maxMessages: smtp.maxMessages,
  });
  if (!transporter || transporterFingerprint !== fingerprint) {
    transporterFingerprint = fingerprint;
    const commonOptions: SMTPTransport.Options = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTLS,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: smtp.rejectUnauthorized },
      connectionTimeout: smtp.connectionTimeout,
      greetingTimeout: smtp.greetingTimeout,
      socketTimeout: smtp.socketTimeout,
    };

    if (smtp.pool) {
      const pooledOptions: SMTPPool.Options = {
        ...commonOptions,
        pool: true,
        maxConnections: smtp.maxConnections,
        maxMessages: smtp.maxMessages,
      };
      transporter = nodemailer.createTransport(pooledOptions);
    } else {
      transporter = nodemailer.createTransport(commonOptions);
    }
  }
  return transporter;
}

export async function verifyEmailTransport(): Promise<{ ok: boolean; configured: boolean; provider: EmailProviderKind; error?: string }> {
  const provider = resolveProvider();
  if (provider === "disabled") return { ok: false, configured: false, provider, error: "Email delivery is disabled" };
  if (provider === "console") return { ok: true, configured: true, provider };
  const transport = getTransport();
  if (!transport) return { ok: false, configured: false, provider, error: "SMTP is not configured" };
  try {
    await transport.verify();
    return { ok: true, configured: true, provider };
  } catch (error) {
    logger.error({ err: error }, "SMTP transport verification failed");
    return { ok: false, configured: true, provider, error: "SMTP connection failed" };
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const provider = resolveProvider();
  if (provider === "disabled") {
    return { ok: false, channel: provider, provider, errorCode: "EMAIL_DISABLED" };
  }
  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, channel: provider, provider, errorCode: "CONSOLE_EMAIL_FORBIDDEN_IN_PRODUCTION" };
    }
    logger.debug({ to: args.to, subject: args.subject, body: args.text || args.html }, "[email:console] development delivery");
    return { ok: true, channel: provider, provider, messageId: `console-${Date.now()}` };
  }

  const transport = getTransport();
  if (!transport) {
    return { ok: false, channel: "smtp", provider: env("EMAIL_PROVIDER", "smtp"), errorCode: "SMTP_NOT_CONFIGURED" };
  }
  const smtp = getSmtpConfig();
  const fromAddress = smtp.fromEmail.includes("<") ? smtp.fromEmail : `"${smtp.fromName}" <${smtp.fromEmail}>`;
  try {
    const info = await transport.sendMail({
      from: fromAddress,
      replyTo: smtp.replyTo || undefined,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      headers: args.headers,
    });
    return {
      ok: true,
      channel: "smtp",
      provider: env("EMAIL_PROVIDER", "smtp"),
      messageId: String(info.messageId || ""),
      response: String(info.response || ""),
    };
  } catch (error) {
    logger.error({ err: error, to: args.to, provider: env("EMAIL_PROVIDER", "smtp") }, "email send failed");
    return { ok: false, channel: "smtp", provider: env("EMAIL_PROVIDER", "smtp"), errorCode: "SMTP_SEND_FAILED" };
  }
}

// Backward-compatible renderers retained for existing provider-verification and
// OTP call sites. New flows use the centralized email template service.
function legacyBrandName(): string {
  return env("EMAIL_BRAND_NAME", env("APP_NAME", "Athoo"));
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderVerificationEmail(status: "approved" | "rejected" | string, providerName: string, note?: string) {
  const brand = legacyBrandName();
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const readableStatus = String(status || "updated").replaceAll("_", " ");
  const subject = isApproved ? `Your ${brand} provider account is approved` : `${brand} verification update`;
  const safeName = String(providerName || "there");
  const text = isApproved
    ? `Hi ${safeName},\n\nYour ${brand} provider account has been approved. You can now accept jobs.\n\n${brand} Team`
    : `Hi ${safeName},\n\nYour provider verification status is ${readableStatus}.${note ? `\n\nNote: ${note}` : ""}\n\n${brand} Team`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px"><h1>${escapeHtml(brand)}</h1><h2>${escapeHtml(subject)}</h2><p>Hi ${escapeHtml(safeName)},</p><p>${isApproved ? "Your provider account has been approved. You can now accept jobs." : isRejected ? "Your verification was not approved at this time." : `Your verification status is now ${escapeHtml(readableStatus)}.`}</p>${note ? `<p><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}<p>${escapeHtml(brand)} Team</p></div>`;
  return { subject, html, text };
}

export function renderOtpEmail(code: string, purpose = "Verification") {
  const brand = legacyBrandName();
  const safePurpose = String(purpose || "Verification");
  const safeCode = /^\d{4,8}$/.test(String(code)) ? String(code) : "";
  const subject = `${brand} ${safePurpose.toLowerCase()} code`;
  const text = `Your ${brand} ${safePurpose.toLowerCase()} code is ${safeCode}. It expires shortly. If you did not request this, ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px"><h1>${escapeHtml(brand)}</h1><h2>${escapeHtml(safePurpose)} code</h2><p>Use this code to continue:</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:18px;background:#f1f5f9;text-align:center;border-radius:12px">${escapeHtml(safeCode)}</div><p>If you did not request this, ignore this email.</p></div>`;
  return { subject, html, text };
}
