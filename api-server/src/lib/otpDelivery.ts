import { deliverEmailNow } from "./emailDelivery";
import { getRuntimeEmailConfigurationStatus } from "./email";
import { logger } from "./logger";

export type OtpDeliveryChannel = "whatsapp_cloud" | "email" | "http_sms";
export type OtpDeliveryMode = "all" | "first_success";

export interface AuthenticationOtpDeliveryArgs {
  otpId: string;
  phone: string;
  code: string;
  purpose: "login" | "registration" | "password_reset";
  role: "customer" | "provider";
  expiresMinutes: number;
  email?: string | null;
  userId?: string | null;
  userName?: string | null;
}

export interface OtpChannelResult {
  channel: OtpDeliveryChannel;
  configured: boolean;
  attempted: boolean;
  ok: boolean;
  errorCode?: string;
}

export interface AuthenticationOtpDeliveryResult {
  delivered: boolean;
  deliveryChannel: string | null;
  deliveredChannels: OtpDeliveryChannel[];
  results: OtpChannelResult[];
  whatsappSent: boolean;
  emailSent: boolean;
  smsSent: boolean;
  message: string;
}

export interface OtpDeliveryConfigurationStatus {
  configured: boolean;
  phoneRegistrationConfigured: boolean;
  verifiedEmailFallbackConfigured: boolean;
  mode: OtpDeliveryMode;
  requestedChannels: OtpDeliveryChannel[];
  configuredChannels: OtpDeliveryChannel[];
  whatsapp: {
    configured: boolean;
    provider: "whatsapp_cloud";
    baseUrlConfigured: boolean;
    tokenConfigured: boolean;
    phoneNumberIdConfigured: boolean;
    templateName: string;
    language: string;
  };
  email: {
    configured: boolean;
    provider: string;
  };
  sms: {
    configured: boolean;
    provider: string;
    endpointConfigured: boolean;
    authConfigured: boolean;
  };
}

function env(name: string, fallback = ""): string {
  return String(process.env[name] ?? fallback).trim();
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

function normalizeChannel(value: string): OtpDeliveryChannel | null {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (["whatsapp", "whatsapp_cloud", "meta_whatsapp"].includes(normalized)) return "whatsapp_cloud";
  if (["email", "smtp"].includes(normalized)) return "email";
  if (["sms", "http_sms", "custom_sms"].includes(normalized)) return "http_sms";
  return null;
}

export function getOtpDeliveryChannels(): OtpDeliveryChannel[] {
  const configured = env("OTP_DELIVERY_CHANNELS", "whatsapp_cloud,email")
    .split(",")
    .map(normalizeChannel)
    .filter((channel): channel is OtpDeliveryChannel => Boolean(channel));
  return [...new Set(configured)];
}

export function getOtpDeliveryMode(): OtpDeliveryMode {
  return env("OTP_DELIVERY_MODE", "first_success").toLowerCase() === "all" ? "all" : "first_success";
}

function whatsappConfiguration() {
  const baseUrl = env("WHATSAPP_GRAPH_BASE_URL", "https://graph.facebook.com").replace(/\/$/, "");
  const configuredVersion = env("WHATSAPP_GRAPH_API_VERSION", "v25.0");
  const apiVersion = /^v\d+\.\d+$/.test(configuredVersion) ? configuredVersion : "v25.0";
  return {
    baseUrl,
    apiVersion,
    token: env("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    templateName: env("WHATSAPP_OTP_TEMPLATE_NAME", "otp_verification"),
    language: env("WHATSAPP_OTP_TEMPLATE_LANGUAGE", "en"),
    timeoutMs: envInt("WHATSAPP_TIMEOUT_MS", 10_000, 1_000, 60_000),
  };
}

function smsConfiguration() {
  const provider = env("SMS_PROVIDER", "disabled").toLowerCase();
  return {
    provider,
    endpoint: env("SMS_HTTP_ENDPOINT"),
    method: env("SMS_HTTP_METHOD", "POST").toUpperCase() === "PUT" ? "PUT" : "POST",
    authHeader: env("SMS_HTTP_AUTH_HEADER", "Authorization"),
    authValue: env("SMS_HTTP_AUTH_VALUE"),
    phoneField: env("SMS_HTTP_PHONE_FIELD", "to"),
    messageField: env("SMS_HTTP_MESSAGE_FIELD", "message"),
    senderField: env("SMS_HTTP_SENDER_FIELD", "sender"),
    senderValue: env("SMS_HTTP_SENDER_VALUE"),
    messageTemplate: env(
      "SMS_OTP_MESSAGE_TEMPLATE",
      "Your {brand} verification code is {code}. It expires in {minutes} minutes.",
    ),
    brandName: env("APP_NAME", env("EMAIL_BRAND_NAME", "Athoo")),
    timeoutMs: envInt("SMS_HTTP_TIMEOUT_MS", 10_000, 1_000, 60_000),
  };
}

function whatsappConfigured(): boolean {
  const config = whatsappConfiguration();
  return Boolean(config.baseUrl && config.token && config.phoneNumberId && config.templateName && config.language);
}

function smsConfigured(): boolean {
  const config = smsConfiguration();
  return config.provider === "http_json" && Boolean(config.endpoint);
}

export async function getOtpDeliveryConfigurationStatus(): Promise<OtpDeliveryConfigurationStatus> {
  const whatsapp = whatsappConfiguration();
  const sms = smsConfiguration();
  const email = await getRuntimeEmailConfigurationStatus();
  const requestedChannels = getOtpDeliveryChannels();
  const configuredChannels = requestedChannels.filter((channel) => {
    if (channel === "whatsapp_cloud") return whatsappConfigured();
    if (channel === "email") return email.configured;
    return smsConfigured();
  });
  const phoneRegistrationConfigured = configuredChannels.some((channel) =>
    channel === "whatsapp_cloud" || channel === "http_sms",
  );
  return {
    configured: configuredChannels.length > 0,
    phoneRegistrationConfigured,
    verifiedEmailFallbackConfigured: configuredChannels.includes("email"),
    mode: getOtpDeliveryMode(),
    requestedChannels,
    configuredChannels,
    whatsapp: {
      configured: whatsappConfigured(),
      provider: "whatsapp_cloud",
      baseUrlConfigured: Boolean(whatsapp.baseUrl),
      tokenConfigured: Boolean(whatsapp.token),
      phoneNumberIdConfigured: Boolean(whatsapp.phoneNumberId),
      templateName: whatsapp.templateName,
      language: whatsapp.language,
    },
    email: {
      configured: email.configured,
      provider: email.configuredProvider,
    },
    sms: {
      configured: smsConfigured(),
      provider: sms.provider,
      endpointConfigured: Boolean(sms.endpoint),
      authConfigured: Boolean(sms.authValue),
    },
  };
}

function normalizePakistanPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.startsWith("3") && digits.length === 10) return `92${digits}`;
  return digits;
}

async function sendWhatsApp(args: AuthenticationOtpDeliveryArgs): Promise<OtpChannelResult> {
  const config = whatsappConfiguration();
  const configured = whatsappConfigured();
  if (!configured) return { channel: "whatsapp_cloud", configured: false, attempted: false, ok: false, errorCode: "WHATSAPP_NOT_CONFIGURED" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePakistanPhone(args.phone),
        type: "template",
        template: {
          name: config.templateName,
          language: { code: config.language },
          components: [{ type: "body", parameters: [{ type: "text", text: args.code }] }],
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({ status: response.status, otpId: args.otpId }, "WhatsApp OTP provider rejected delivery");
      return { channel: "whatsapp_cloud", configured: true, attempted: true, ok: false, errorCode: `WHATSAPP_HTTP_${response.status}` };
    }
    return { channel: "whatsapp_cloud", configured: true, attempted: true, ok: true };
  } catch (error) {
    logger.warn({ err: error, otpId: args.otpId }, "WhatsApp OTP delivery failed");
    return { channel: "whatsapp_cloud", configured: true, attempted: true, ok: false, errorCode: "WHATSAPP_DELIVERY_FAILED" };
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmailOtp(args: AuthenticationOtpDeliveryArgs): Promise<OtpChannelResult> {
  const status = await getRuntimeEmailConfigurationStatus();
  if (!status.configured || !args.email) {
    return {
      channel: "email",
      configured: status.configured,
      attempted: false,
      ok: false,
      errorCode: args.email ? "EMAIL_NOT_CONFIGURED" : "EMAIL_ADDRESS_UNAVAILABLE",
    };
  }
  const templateKey = args.purpose === "password_reset"
    ? "password_reset"
    : args.purpose === "registration"
      ? "registration_otp"
      : "email_login_otp";
  const delivery = await deliverEmailNow({
    userId: args.userId || null,
    to: args.email,
    templateKey,
    category: "security",
    dedupeKey: `authentication-otp:${args.otpId}:email`,
    variables: {
      name: args.userName || "there",
      code: args.code,
      expiresMinutes: args.expiresMinutes,
      category: "security",
    },
    metadata: {
      otpId: args.otpId,
      purpose: args.purpose,
      role: args.role,
      deliveryFallback: "authentication_otp",
    },
  }).catch(() => null);
  return {
    channel: "email",
    configured: true,
    attempted: true,
    ok: delivery?.ok === true,
    errorCode: delivery?.ok === true ? undefined : delivery?.errorCode || "EMAIL_DELIVERY_FAILED",
  };
}

function renderSmsMessage(args: AuthenticationOtpDeliveryArgs): string {
  const config = smsConfiguration();
  return config.messageTemplate
    .replaceAll("{brand}", config.brandName)
    .replaceAll("{code}", args.code)
    .replaceAll("{minutes}", String(args.expiresMinutes))
    .replaceAll("{purpose}", args.purpose);
}

async function sendHttpSms(args: AuthenticationOtpDeliveryArgs): Promise<OtpChannelResult> {
  const config = smsConfiguration();
  const configured = smsConfigured();
  if (!configured) return { channel: "http_sms", configured: false, attempted: false, ok: false, errorCode: "SMS_NOT_CONFIGURED" };

  const body: Record<string, string> = {
    [config.phoneField]: normalizePakistanPhone(args.phone),
    [config.messageField]: renderSmsMessage(args),
  };
  if (config.senderValue) body[config.senderField] = config.senderValue;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.authValue) headers[config.authHeader] = config.authValue;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: config.method,
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({ status: response.status, provider: config.provider, otpId: args.otpId }, "SMS OTP provider rejected delivery");
      return { channel: "http_sms", configured: true, attempted: true, ok: false, errorCode: `SMS_HTTP_${response.status}` };
    }
    return { channel: "http_sms", configured: true, attempted: true, ok: true };
  } catch (error) {
    logger.warn({ err: error, provider: config.provider, otpId: args.otpId }, "SMS OTP delivery failed");
    return { channel: "http_sms", configured: true, attempted: true, ok: false, errorCode: "SMS_DELIVERY_FAILED" };
  } finally {
    clearTimeout(timer);
  }
}

function deliveryMessage(channels: OtpDeliveryChannel[]): string {
  const labels = channels.map((channel) => {
    if (channel === "whatsapp_cloud") return "WhatsApp";
    if (channel === "http_sms") return "SMS";
    return "email";
  });
  if (labels.length === 0) return "Verification code delivery is temporarily unavailable.";
  if (labels.length === 1) return `Verification code sent by ${labels[0]}.`;
  return `Verification code sent by ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}.`;
}

export async function deliverAuthenticationOtp(args: AuthenticationOtpDeliveryArgs): Promise<AuthenticationOtpDeliveryResult> {
  // A registration challenge proves possession of the phone number, so it may
  // only use phone-bound channels. Email verification remains a separate,
  // explicit post-registration security control.
  const channels = getOtpDeliveryChannels().filter((channel) =>
    args.purpose === "registration" ? channel !== "email" : true,
  );
  const mode = getOtpDeliveryMode();
  const results: OtpChannelResult[] = [];

  for (const channel of channels) {
    let result: OtpChannelResult;
    if (channel === "whatsapp_cloud") result = await sendWhatsApp(args);
    else if (channel === "email") result = await sendEmailOtp(args);
    else result = await sendHttpSms(args);
    results.push(result);
    if (mode === "first_success" && result.ok) break;
  }

  const deliveredChannels = results.filter((result) => result.ok).map((result) => result.channel);
  return {
    delivered: deliveredChannels.length > 0,
    deliveryChannel: deliveredChannels.length ? deliveredChannels.join("+") : null,
    deliveredChannels,
    results,
    whatsappSent: deliveredChannels.includes("whatsapp_cloud"),
    emailSent: deliveredChannels.includes("email"),
    smsSent: deliveredChannels.includes("http_sms"),
    message: deliveryMessage(deliveredChannels),
  };
}
