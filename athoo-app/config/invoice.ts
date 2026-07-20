import { brandConfig } from "@/config/brand";
import { runtimeConfig } from "@/config/runtime";

/**
 * Central print/export palette. Invoice PDFs intentionally use a stable light
 * document theme for printing, independent of the device's light/dark mode.
 * Branding and contact details remain deployment-configurable.
 */
export const invoiceConfig = Object.freeze({
  brandName: brandConfig.displayName,
  descriptor: brandConfig.descriptor,
  colors: Object.freeze({
    primary: brandConfig.colors.primary,
    primaryPressed: brandConfig.colors.primaryPressed,
    success: "#059669",
    successPressed: "#047857",
    danger: "#DC2626",
    text: "#0F172A",
    textSecondary: "#64748B",
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
  contactLine: [
    runtimeConfig.support.phoneDisplay,
    runtimeConfig.support.email,
    runtimeConfig.support.socialHandle,
  ].filter(Boolean).join(" · "),
});
