import nodemailer from "nodemailer";
import SMTPPool from "nodemailer/lib/smtp-pool";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { getRuntimeCommunicationOverrides, runtimeProviderValue } from "./communicationRuntime";
import {
  buildHttpHeaders,
  envInteger,
  envValue,
  fetchWithTimeout,
  parseJsonTemplate,
  readPath,
  renderJsonTemplate,
} from "../integrations/httpJsonAdapter";
import { logger } from "./logger";

export type EmailProviderKind = "smtp" | "http_json" | "console" | "disabled";

export interface EmailProviderStatus {
  provider: EmailProviderKind;
  configuredProvider: string;
  configured: boolean;
  hostConfigured: boolean;
  userConfigured: boolean;
  passwordConfigured: boolean;
  fromConfigured: boolean;
  endpointConfigured: boolean;
  authConfigured: boolean;
  port: number;
  secure: boolean;
  requireTls: boolean;
  pooled: boolean;
  runtimeOverride: boolean;
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

function configuredProviderName(providerOverride = ""): string {
  const override = String(providerOverride || "").trim().toLowerCase();
  return override && override !== "environment" ? override : env("EMAIL_PROVIDER", "smtp").toLowerCase();
}

export function resolveEmailProvider(providerOverride = ""): EmailProviderKind {
  const configured = configuredProviderName(providerOverride);
  if (["disabled", "off", "none"].includes(configured)) return "disabled";
  if (configured === "console") return "console";
  if (["http", "http_json", "api", "webhook"].includes(configured)) return "http_json";
  // Any SMTP-compatible vendor label (zoho_smtp, ses_smtp, postmark_smtp,
  // mailgun_smtp, etc.) resolves to the standards-based SMTP adapter.
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

function getHttpEmailConfig() {
  const endpoint = envValue("EMAIL_HTTP_ENDPOINT");
  const method = envValue("EMAIL_HTTP_METHOD", "POST").toUpperCase();
  const fromName = envValue("EMAIL_FROM_NAME", "Athoo");
  const fromEmail = envValue("EMAIL_FROM_ADDRESS", envValue("EMAIL_FROM"));
  const replyTo = envValue("EMAIL_REPLY_TO");
  return {
    endpoint,
    method: ["POST", "PUT", "PATCH"].includes(method) ? method : "POST",
    fromName,
    fromEmail,
    replyTo,
    timeoutMs: envInteger("EMAIL_HTTP_TIMEOUT_MS", 10_000, 1_000, 120_000),
    healthcheckUrl: envValue("EMAIL_HTTP_HEALTHCHECK_URL"),
    bodyTemplate: parseJsonTemplate(envValue("EMAIL_HTTP_BODY_TEMPLATE_JSON")),
    messageIdPath: envValue("EMAIL_HTTP_MESSAGE_ID_PATH", "id"),
  };
}

export function getEmailConfigurationStatus(providerOverride = ""): EmailProviderStatus {
  const provider = resolveEmailProvider(providerOverride);
  const configuredProvider = configuredProviderName(providerOverride);
  const smtp = getSmtpConfig();
  const http = getHttpEmailConfig();
  const smtpConfigured = Boolean(smtp.host && smtp.port && smtp.user && smtp.pass && smtp.fromEmail);
  const httpConfigured = Boolean(http.endpoint && http.endpoint.startsWith("https://") && http.fromEmail);
  return {
    provider,
    configuredProvider,
    configured: provider === "console" || (provider === "smtp" && smtpConfigured) || (provider === "http_json" && httpConfigured),
    hostConfigured: Boolean(smtp.host),
    userConfigured: Boolean(smtp.user),
    passwordConfigured: Boolean(smtp.pass),
    fromConfigured: Boolean(provider === "http_json" ? http.fromEmail : smtp.fromEmail),
    endpointConfigured: Boolean(http.endpoint),
    authConfigured: Boolean(envValue("EMAIL_HTTP_AUTH_VALUE")),
    port: smtp.port,
    secure: smtp.secure,
    requireTls: smtp.requireTLS,
    pooled: smtp.pool,
    runtimeOverride: Boolean(providerOverride && providerOverride !== "environment"),
  };
}

export async function getRuntimeEmailConfigurationStatus(): Promise<EmailProviderStatus> {
  const runtime = await getRuntimeCommunicationOverrides();
  return getEmailConfigurationStatus(runtimeProviderValue(runtime.enabled, runtime.emailProvider));
}

function getTransport(providerOverride = ""): nodemailer.Transporter | null {
  if (resolveEmailProvider(providerOverride) !== "smtp") return null;
  const smtp = getSmtpConfig();
  const status = getEmailConfigurationStatus(providerOverride);
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

async function sendHttpJsonEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const config = getHttpEmailConfig();
  if (!config.endpoint || !config.endpoint.startsWith("https://") || !config.fromEmail) {
    return { ok: false, channel: "http_json", provider: configuredProviderName("http_json"), errorCode: "EMAIL_HTTP_NOT_CONFIGURED" };
  }

  const headers = buildHttpHeaders({
    defaultContentType: "application/json",
    headersJsonEnv: "EMAIL_HTTP_HEADERS_JSON",
    authHeaderEnv: "EMAIL_HTTP_AUTH_HEADER",
    authValueEnv: "EMAIL_HTTP_AUTH_VALUE",
    authPrefixEnv: "EMAIL_HTTP_AUTH_PREFIX",
  });
  const stringTokens = {
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text || "",
    from: config.fromEmail,
    fromName: config.fromName,
    replyTo: config.replyTo,
  };
  const defaultPayload = {
    [envValue("EMAIL_HTTP_TO_FIELD", "to")]: args.to,
    [envValue("EMAIL_HTTP_SUBJECT_FIELD", "subject")]: args.subject,
    [envValue("EMAIL_HTTP_HTML_FIELD", "html")]: args.html,
    [envValue("EMAIL_HTTP_TEXT_FIELD", "text")]: args.text || "",
    [envValue("EMAIL_HTTP_FROM_FIELD", "from")]: config.fromEmail,
    [envValue("EMAIL_HTTP_FROM_NAME_FIELD", "fromName")]: config.fromName,
    [envValue("EMAIL_HTTP_REPLY_TO_FIELD", "replyTo")]: config.replyTo,
    headers: args.headers || {},
  };
  const payload = config.bodyTemplate
    ? renderJsonTemplate(config.bodyTemplate, stringTokens, { __ATHOO_EMAIL_HEADERS__: args.headers || {} })
    : defaultPayload;

  try {
    const response = await fetchWithTimeout(config.endpoint, {
      method: config.method,
      headers,
      body: JSON.stringify(payload),
    }, config.timeoutMs);
    const text = await response.text();
    if (!response.ok) {
      logger.warn({ status: response.status, provider: "http_json", to: args.to }, "HTTP email provider rejected delivery");
      return { ok: false, channel: "http_json", provider: configuredProviderName("http_json"), errorCode: `EMAIL_HTTP_${response.status}` };
    }
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    const messageId = String(readPath(parsed, config.messageIdPath) || response.headers.get("x-message-id") || "").trim();
    return {
      ok: true,
      channel: "http_json",
      provider: configuredProviderName("http_json"),
      ...(messageId ? { messageId } : {}),
      response: text.slice(0, 500),
    };
  } catch (error) {
    logger.error({ err: error, to: args.to, provider: "http_json" }, "HTTP email send failed");
    return { ok: false, channel: "http_json", provider: configuredProviderName("http_json"), errorCode: "EMAIL_HTTP_SEND_FAILED" };
  }
}

export async function verifyEmailTransport(): Promise<{ ok: boolean; configured: boolean; provider: EmailProviderKind; error?: string }> {
  const runtime = await getRuntimeCommunicationOverrides();
  const providerOverride = runtimeProviderValue(runtime.enabled, runtime.emailProvider);
  const provider = resolveEmailProvider(providerOverride);
  if (provider === "disabled") return { ok: false, configured: false, provider, error: "Email delivery is disabled" };
  if (provider === "console") return { ok: true, configured: true, provider };
  if (provider === "http_json") {
    const status = getEmailConfigurationStatus(providerOverride);
    if (!status.configured) return { ok: false, configured: false, provider, error: "HTTP email adapter is not configured" };
    const config = getHttpEmailConfig();
    if (!config.healthcheckUrl) return { ok: true, configured: true, provider };
    try {
      const response = await fetchWithTimeout(config.healthcheckUrl, {
        method: "GET",
        headers: buildHttpHeaders({
          headersJsonEnv: "EMAIL_HTTP_HEADERS_JSON",
          authHeaderEnv: "EMAIL_HTTP_AUTH_HEADER",
          authValueEnv: "EMAIL_HTTP_AUTH_VALUE",
          authPrefixEnv: "EMAIL_HTTP_AUTH_PREFIX",
        }),
      }, config.timeoutMs);
      return response.ok
        ? { ok: true, configured: true, provider }
        : { ok: false, configured: true, provider, error: `HTTP email healthcheck returned ${response.status}` };
    } catch (error) {
      logger.error({ err: error }, "HTTP email transport verification failed");
      return { ok: false, configured: true, provider, error: "HTTP email healthcheck failed" };
    }
  }
  const transport = getTransport(providerOverride);
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
  const runtime = await getRuntimeCommunicationOverrides();
  const providerOverride = runtimeProviderValue(runtime.enabled, runtime.emailProvider);
  const provider = resolveEmailProvider(providerOverride);
  const providerName = configuredProviderName(providerOverride);
  if (provider === "disabled") {
    return { ok: false, channel: provider, provider: providerName, errorCode: "EMAIL_DISABLED" };
  }
  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, channel: provider, provider: providerName, errorCode: "CONSOLE_EMAIL_FORBIDDEN_IN_PRODUCTION" };
    }
    logger.debug({ to: args.to, subject: args.subject, body: args.text || args.html }, "[email:console] development delivery");
    return { ok: true, channel: provider, provider: providerName, messageId: `console-${Date.now()}` };
  }
  if (provider === "http_json") return sendHttpJsonEmail(args);

  const transport = getTransport(providerOverride);
  if (!transport) {
    return { ok: false, channel: "smtp", provider: providerName, errorCode: "SMTP_NOT_CONFIGURED" };
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
      provider: providerName,
      messageId: String(info.messageId || ""),
      response: String(info.response || ""),
    };
  } catch (error) {
    logger.error({ err: error, to: args.to, provider: providerName }, "email send failed");
    return { ok: false, channel: "smtp", provider: providerName, errorCode: "SMTP_SEND_FAILED" };
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
