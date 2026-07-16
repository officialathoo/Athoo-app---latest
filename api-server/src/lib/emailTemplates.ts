import { db } from "@workspace/db";
import { notificationTemplatesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

export type EmailTemplateKey =
  | "email_verification"
  | "email_login_otp"
  | "registration_otp"
  | "welcome"
  | "password_reset"
  | "password_changed"
  | "new_device_login"
  | "email_changed"
  | "account_status"
  | "campaign_custom";

export type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

type TemplateDefinition = { subject: string; body: string; category: string };

const BUILT_INS: Record<EmailTemplateKey, TemplateDefinition> = {
  email_verification: {
    subject: "Verify your {{brandName}} email",
    body: "Hi {{name}},\n\nYour {{brandName}} email verification code is {{code}}. It expires in {{expiresMinutes}} minutes.\n\nIf you did not request this, ignore this email.",
    category: "security",
  },
  email_login_otp: {
    subject: "Your {{brandName}} sign-in code",
    body: "Hi {{name}},\n\nUse {{code}} to sign in to {{brandName}}. This code expires in {{expiresMinutes}} minutes.\n\nNever share this code with anyone.",
    category: "security",
  },
  registration_otp: {
    subject: "Your {{brandName}} registration code",
    body: "Hi {{name}},\n\nUse {{code}} to continue creating your {{brandName}} account. This code expires in {{expiresMinutes}} minutes.\n\nThis code verifies the registration request; email-address verification is completed separately after account creation.",
    category: "security",
  },
  welcome: {
    subject: "Welcome to {{brandName}}",
    body: "Hi {{name}},\n\nWelcome to {{brandName}}. Your {{role}} account has been created successfully.\n\nYou can now open the app and continue setting up your profile.",
    category: "transactional",
  },
  password_reset: {
    subject: "Your {{brandName}} password reset code",
    body: "Hi {{name}},\n\nYour password reset code is {{code}}. It expires in {{expiresMinutes}} minutes.\n\nIf you did not request this, secure your account and contact support.",
    category: "security",
  },
  password_changed: {
    subject: "Your {{brandName}} password was changed",
    body: "Hi {{name}},\n\nYour {{brandName}} password was changed on {{timestamp}}.\n\nIf this was not you, contact {{supportName}} immediately.",
    category: "security",
  },
  new_device_login: {
    subject: "New sign-in to your {{brandName}} account",
    body: "Hi {{name}},\n\nA new sign-in was detected on {{timestamp}}.\nDevice: {{device}}\nIP: {{ip}}\n\nIf this was not you, change your password and contact {{supportName}}.",
    category: "security",
  },
  email_changed: {
    subject: "Your {{brandName}} email address was changed",
    body: "Hi {{name}},\n\nYour {{brandName}} account email was changed to {{email}} on {{timestamp}}.\n\nIf this was not you, contact {{supportName}} immediately.",
    category: "security",
  },
  account_status: {
    subject: "{{brandName}} account status update",
    body: "Hi {{name}},\n\nYour {{brandName}} account status is now {{status}}.\n{{reason}}\n\nContact {{supportName}} if you need assistance.",
    category: "security",
  },
  campaign_custom: {
    subject: "{{subject}}",
    body: "{{body}}",
    category: "marketing",
  },
};

function env(name: string, fallback = ""): string {
  return String(process.env[name] || fallback).trim();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderString(template: string, variables: TemplateVariables): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => String(variables[key] ?? ""));
}

function emailShell(subject: string, bodyText: string, category: string, unsubscribeUrl?: string): string {
  const brandName = env("EMAIL_BRAND_NAME", "Athoo");
  const brandColor = /^#[0-9a-f]{6}$/i.test(env("EMAIL_BRAND_COLOR", "#1A6EE0")) ? env("EMAIL_BRAND_COLOR", "#1A6EE0") : "#1A6EE0";
  const supportEmail = env("EMAIL_SUPPORT_ADDRESS", env("EMAIL_REPLY_TO"));
  const descriptor = env("EMAIL_BRAND_DESCRIPTOR", "Trusted services, connected safely");
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#334155;line-height:1.6">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
  const unsubscribe = category === "marketing" && unsubscribeUrl
    ? `<p style="margin:18px 0 0;font-size:12px;color:#94a3b8">You can <a href="${escapeHtml(unsubscribeUrl)}" style="color:${brandColor}">unsubscribe from promotional emails</a> at any time.</p>`
    : "";
  const support = supportEmail
    ? `<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Need help? Contact ${escapeHtml(supportEmail)}.</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;padding:24px;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:30px;box-shadow:0 6px 24px rgba(15,23,42,.08)"><h1 style="margin:0 0 4px;color:${brandColor};font-size:24px">${escapeHtml(brandName)}</h1><p style="margin:0 0 24px;color:#64748b;font-size:13px">${escapeHtml(descriptor)}</p><h2 style="margin:0 0 20px;color:#0f172a;font-size:20px">${escapeHtml(subject)}</h2>${paragraphs}${support}${unsubscribe}</div></body></html>`;
}

export async function renderEmailTemplate(
  key: EmailTemplateKey | string,
  variables: TemplateVariables,
  options: { unsubscribeUrl?: string } = {},
): Promise<{ subject: string; text: string; html: string; category: string; source: "database" | "built-in" }> {
  const builtIn = BUILT_INS[key as EmailTemplateKey] || BUILT_INS.campaign_custom;
  let subjectTemplate = builtIn.subject;
  let bodyTemplate = builtIn.body;
  let source: "database" | "built-in" = "built-in";

  try {
    const override = await db.query.notificationTemplatesTable.findFirst({
      where: and(
        eq(notificationTemplatesTable.key, key),
        eq(notificationTemplatesTable.channel, "email"),
        eq(notificationTemplatesTable.isActive, true),
      ),
    });
    if (override) {
      subjectTemplate = override.subject || subjectTemplate;
      bodyTemplate = override.body || bodyTemplate;
      source = "database";
    }
  } catch {
    // Built-in templates keep security and account emails operational if the
    // optional template table is temporarily unavailable.
  }

  const brandName = env("EMAIL_BRAND_NAME", "Athoo");
  const resolvedVariables: TemplateVariables = {
    brandName,
    supportName: `${brandName} Support`,
    ...variables,
  };
  const subject = renderString(subjectTemplate, resolvedVariables).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const text = renderString(bodyTemplate, resolvedVariables).slice(0, 20_000);
  const requestedCategory = String(resolvedVariables.category || builtIn.category);
  const category = new Set(["security", "transactional", "booking", "product", "marketing"]).has(requestedCategory)
    ? requestedCategory
    : builtIn.category;
  return { subject, text, html: emailShell(subject, text, category, options.unsubscribeUrl), category, source };
}
