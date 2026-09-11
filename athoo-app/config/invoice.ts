import { brandConfig } from "@/config/brand";
import { runtimeConfig } from "@/config/runtime";

function displayUrl(value?: string): string {
  const normalized = String(value || "");
  const withoutProtocol = normalized.startsWith("https://") ? normalized.slice(8) : normalized.startsWith("http://") ? normalized.slice(7) : normalized;
  return withoutProtocol.endsWith("/") ? withoutProtocol.slice(0, -1) : withoutProtocol;
}

const socialLinks = [
  runtimeConfig.support.xUrl
    ? { label: "X", url: runtimeConfig.support.xUrl }
    : null,
  runtimeConfig.support.instagramUrl
    ? { label: "Instagram", url: runtimeConfig.support.instagramUrl }
    : null,
  runtimeConfig.support.facebookUrl
    ? { label: "Facebook", url: runtimeConfig.support.facebookUrl }
    : null,
  runtimeConfig.support.whatsappUrl
    ? { label: "WhatsApp", url: runtimeConfig.support.whatsappUrl }
    : null,
].filter((entry): entry is { label: string; url: string } => Boolean(entry));

/**
 * Stable light A4 invoice configuration. Public support/branding values are
 * deployment-configurable; missing optional values are omitted instead of
 * rendering placeholders. Customer/provider private phone numbers are never
 * sourced into invoice branding.
 */
export const invoiceConfig = Object.freeze({
  brandName: brandConfig.displayName,
  descriptor: brandConfig.descriptor,
  colors: Object.freeze({
    primary: brandConfig.colors.primary,
    primaryPressed: brandConfig.colors.primaryPressed,
    secondary: brandConfig.colors.secondary,
    secondaryPressed: brandConfig.colors.secondaryPressed,
    navy: "#0B2A5B",
    success: "#059669",
    successPressed: "#047857",
    danger: "#DC2626",
    text: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    page: "#FFFFFF",
    canvas: "#E2E8F0",
    background: "#F8FAFC",
    surface: "#F1F5F9",
    border: "#CBD5E1",
    info: "#0369A1",
    infoSoft: "#F0F9FF",
    infoBorder: "#BAE6FD",
    successSoft: "#F0FDF4",
    successBorder: "#86EFAC",
  }),
  contacts: Object.freeze({
    websiteUrl: runtimeConfig.support.websiteUrl,
    websiteDisplay: displayUrl(runtimeConfig.support.websiteUrl),
    email: runtimeConfig.support.email,
    phoneDisplay: runtimeConfig.support.phoneDisplay,
    socialHandle: runtimeConfig.support.socialHandle || "@athoo_services",
  }),
  socialLinks: Object.freeze(socialLinks),
  contactLine: [
    displayUrl(runtimeConfig.support.websiteUrl),
    runtimeConfig.support.email,
    runtimeConfig.support.phoneDisplay,
    runtimeConfig.support.socialHandle || "@athoo_services",
  ].filter(Boolean).join(" | "),
});
