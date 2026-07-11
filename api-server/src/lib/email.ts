import nodemailer from "nodemailer";
import { logger } from "./logger";

const SMTP_HOST = process.env["SMTP_HOST"] || "smtp.gmail.com";
const SMTP_PORT = Number(process.env["SMTP_PORT"] || 465);
const SMTP_USER = process.env["SMTP_USER"] || "";
const SMTP_PASS = process.env["SMTP_PASS"] || process.env["GMAIL_APP_PASSWORD"] || "";
const FROM_ADDRESS = process.env["SMTP_FROM"] || process.env["EMAIL_FROM"] || `"Athoo" <${SMTP_USER}>`;

let transporter: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; channel: "smtp" | "console" }> {
  const transport = getTransport();
  if (!transport) {
    // Dev / unconfigured — log instead of failing so the app still works.
    logger.info({ to: args.to, subject: args.subject }, "[email:console] (no SMTP_PASS configured)");
    if (process.env["NODE_ENV"] !== "production") {
      logger.debug({ to: args.to, subject: args.subject, body: args.text || args.html }, "[email:console] (dev mode)");
    }
    return { ok: true, channel: "console" };
  }
  try {
    await transport.sendMail({
      from: FROM_ADDRESS,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { ok: true, channel: "smtp" };
  } catch (e) {
    logger.error({ err: e, to: args.to }, "email send failed");
    return { ok: false, channel: "smtp" };
  }
}

export function renderVerificationEmail(
  status: "approved" | "rejected" | string,
  providerName: string,
  note?: string,
): { html: string; text: string; subject: string } {
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const subject = isApproved
    ? "Your Athoo provider account is approved! 🎉"
    : isRejected
    ? "Athoo verification update"
    : "Athoo verification status update";
  const bodyText = isApproved
    ? `Hi ${providerName},\n\nGreat news! Your Athoo provider account has been approved. You can now accept jobs and start earning.\n\nLog in to the Athoo app to get started.\n\nAthoo Team`
    : isRejected
    ? `Hi ${providerName},\n\nWe're sorry, your provider verification was not approved at this time.\n\n${note ? `Reason: ${note}\n\n` : ""}Please review your submitted documents and resubmit. If you have questions, contact our support team.\n\nAthoo Team`
    : `Hi ${providerName},\n\nYour verification status has been updated to: ${status.replace("_", " ")}.\n${note ? `\nNote: ${note}\n` : ""}\nAthoo Team`;
  const accentColor = isApproved ? "#16A34A" : isRejected ? "#DC2626" : "#1A6EE0";
  const icon = isApproved ? "✓" : isRejected ? "✕" : "ℹ";
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#F4F6FB;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.06)">
        <h1 style="margin:0 0 8px;color:#1A6EE0;font-size:22px">Athoo</h1>
        <p style="margin:0 0 24px;color:#475569">Pakistani service marketplace</p>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:44px;height:44px;border-radius:50%;background:${accentColor}20;display:flex;align-items:center;justify-content:center;font-size:22px;color:${accentColor};font-weight:700;text-align:center;line-height:44px">${icon}</div>
          <h2 style="margin:0;color:#0F172A;font-size:18px">${subject}</h2>
        </div>
        <p style="margin:0 0 16px;color:#334155">Hi ${providerName},</p>
        ${isApproved ? `<p style="margin:0 0 16px;color:#334155">Your Athoo provider account has been <strong style="color:${accentColor}">approved</strong>. You can now receive job requests and start earning.</p><p style="margin:0 0 20px;color:#334155">Open the Athoo app to set your availability and start accepting jobs.</p>` : ""}
        ${isRejected ? `<p style="margin:0 0 16px;color:#334155">Unfortunately, your verification was <strong style="color:${accentColor}">not approved</strong> at this time.</p>${note ? `<div style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 16px;border-radius:8px;margin-bottom:16px"><p style="margin:0;color:#7F1D1D;font-size:14px"><strong>Reason:</strong> ${note}</p></div>` : ""}<p style="margin:0 0 20px;color:#334155">Please review your submitted documents and resubmit through the Athoo app. Contact support if you need help.</p>` : ""}
        ${!isApproved && !isRejected ? `<p style="margin:0 0 16px;color:#334155">Your verification status is now: <strong>${status.replace("_", " ")}</strong>.</p>${note ? `<p style="margin:0 0 16px;color:#334155">${note}</p>` : ""}` : ""}
        <p style="margin:24px 0 0;color:#94A3B8;font-size:12px">This email was sent by Athoo. If you did not register as a provider, please ignore this email.</p>
      </div>
    </div>`;
  return { subject, html, text: bodyText };
}

export function renderOtpEmail(code: string, purpose = "Verification"): { html: string; text: string; subject: string } {
  const subject = `${purpose} code: ${code}`;
  const text = `Your Athoo ${purpose.toLowerCase()} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#F4F6FB;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.06)">
        <h1 style="margin:0 0 8px;color:#1A6EE0;font-size:22px">Athoo</h1>
        <p style="margin:0 0 24px;color:#475569">Pakistani service marketplace</p>
        <h2 style="margin:0 0 8px;color:#0F172A;font-size:18px">${purpose} code</h2>
        <p style="margin:0 0 16px;color:#475569">Use this code to continue. It expires in 10 minutes.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0F172A;background:#F1F5F9;border-radius:12px;padding:18px;text-align:center">${code}</div>
        <p style="margin:24px 0 0;color:#94A3B8;font-size:12px">If you did not request this, you can safely ignore this email.</p>
      </div>
    </div>`;
  return { subject, html, text };
}

