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
  | "account_action_otp"
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
  account_action_otp: {
    subject: "Confirm your {{brandName}} account action",
    body: "Hi {{name}},\n\nUse {{code}} to {{action}}. This code expires in {{expiresMinutes}} minutes and works only for this specific action.\n\nNever share this code. If you did not request this, keep your account active, change your password, and contact {{supportName}}.",
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

function emailShell(
  subject: string,
  bodyText: string,
  category: string,
  templateKey: string,
  unsubscribeUrl?: string,
): string {
  const brandName = env("EMAIL_BRAND_NAME", "Athoo");
  const configuredBrandColor = env("EMAIL_BRAND_COLOR", "#1A6EE0");
  const configuredAccentColor = env("EMAIL_BRAND_ACCENT_COLOR", "#F59E0B");
  const brandColor = /^#[0-9a-f]{6}$/i.test(configuredBrandColor) ? configuredBrandColor : "#1A6EE0";
  const accentColor = /^#[0-9a-f]{6}$/i.test(configuredAccentColor) ? configuredAccentColor : "#F59E0B";
  const supportEmail = env("EMAIL_SUPPORT_ADDRESS", env("EMAIL_REPLY_TO", "support@athoo.pk"));
  const descriptor = env("EMAIL_BRAND_DESCRIPTOR", "Trusted services, connected safely");
  const logoUrl = env("EMAIL_LOGO_URL");
  const websiteUrl = env("EMAIL_WEBSITE_URL", "https://www.athoo.pk");
  const currentYear = new Date().getUTCFullYear();

  const logo = /^https:\/\//i.test(logoUrl)
    ? `<img src="${escapeHtml(logoUrl)}" width="118" alt="${escapeHtml(brandName)}" style="display:block;max-width:118px;height:auto;border:0;outline:none;text-decoration:none">`
    : `<div style="font-size:26px;line-height:1;font-weight:800;letter-spacing:-0.5px;color:${brandColor}">${escapeHtml(brandName)}</div>`;

  const otpTemplate = new Set([
    "email_verification",
    "email_login_otp",
    "registration_otp",
    "password_reset",
    "account_action_otp",
  ]).has(templateKey);

  const formatParagraph = (paragraph: string): string => {
    let html = escapeHtml(paragraph).replaceAll("\n", "<br>");
    if (otpTemplate) {
      html = html.replace(
        /\b(\d{6})\b/g,
        `<span style="display:inline-block;margin:8px 0;padding:12px 18px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;color:${brandColor};font-size:26px;font-weight:800;letter-spacing:6px">$1</span>`,
      );
    }
    return html;
  };

  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.65">${formatParagraph(paragraph)}</p>`)
    .join("");

  const securityNotice = category === "security"
    ? `<div style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12;font-size:12px;line-height:1.55"><strong>Security reminder:</strong> ${escapeHtml(brandName)} will never ask you to share your verification code or password.</div>`
    : "";

  const unsubscribe = category === "marketing" && unsubscribeUrl
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">You can <a href="${escapeHtml(unsubscribeUrl)}" style="color:${brandColor};text-decoration:none">unsubscribe from promotional emails</a> at any time.</p>`
    : "";

  const support = supportEmail
    ? `<a href="mailto:${escapeHtml(supportEmail)}" style="color:${brandColor};text-decoration:none">${escapeHtml(supportEmail)}</a>`
    : `${escapeHtml(brandName)} Support`;

  const website = /^https:\/\//i.test(websiteUrl)
    ? `<a href="${escapeHtml(websiteUrl)}" style="color:${brandColor};text-decoration:none">${escapeHtml(websiteUrl.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>`
    : escapeHtml(websiteUrl);

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7fb">
    <tr>
      <td align="center" style="padding:28px 14px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">
          <tr>
            <td style="height:5px;background:${brandColor};font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:26px 30px 18px">
              ${logo}
              <div style="margin-top:8px;color:#64748b;font-size:12px;line-height:1.4">${escapeHtml(descriptor)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px">
              <div style="height:1px;background:#e2e8f0;font-size:0;line-height:0">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 30px 12px">
              <h1 style="margin:0 0 20px;color:#0f172a;font-size:23px;line-height:1.3;font-weight:800">${escapeHtml(subject)}</h1>
              ${paragraphs}
              ${securityNotice}
              <div style="margin-top:26px;color:#334155;font-size:14px;line-height:1.6">
                Regards,<br>
                <strong>${escapeHtml(brandName)} Team</strong>
              </div>
              <div style="margin-top:22px;height:3px;width:42px;border-radius:99px;background:${accentColor}"></div>
              ${unsubscribe}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px 26px">
              <div style="padding-top:18px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;line-height:1.65">
                Need help? ${support}<br>
                ${website}<br>
                &copy; ${currentYear} ${escapeHtml(brandName)}. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  return { subject, text, html: emailShell(subject, text, category, String(key), options.unsubscribeUrl), category, source };
}
