import type { AthooTheme } from "@/design/theme";

type CategoryAppearanceInput = {
  color?: string | null;
  bgColor?: string | null;
};

type Rgb = { r: number; g: number; b: number };

function parseHex(value: unknown): Rgb | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function mix(foreground: string, target: string, amount: number): string {
  const from = parseHex(foreground);
  const to = parseHex(target);
  if (!from || !to) return foreground;
  const ratio = Math.max(0, Math.min(1, amount));
  return toHex({
    r: from.r + (to.r - from.r) * ratio,
    g: from.g + (to.g - from.g) * ratio,
    b: from.b + (to.b - from.b) * ratio,
  });
}

function relativeLuminance(value: string): number {
  const rgb = parseHex(value);
  if (!rgb) return 0;
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableAccent(value: string, theme: AthooTheme): string {
  const normalized = parseHex(value) ? value.toUpperCase() : theme.colors.primary;
  if (contrastRatio(normalized, theme.colors.surface) >= 3) return normalized;
  const target = theme.dark ? theme.colors.onBrand : theme.colors.onLight;
  for (const amount of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const candidate = mix(normalized, target, amount);
    if (contrastRatio(candidate, theme.colors.surface) >= 3) return candidate;
  }
  return target;
}

function withAlpha(value: string, opacity: number): string {
  const normalized = parseHex(value) ? value.slice(0, 7) : value;
  if (!parseHex(normalized)) return value;
  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255))).toString(16).padStart(2, "0");
  return `${normalized}${alpha}`.toUpperCase();
}

function safeLightBackground(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^(?:#[0-9a-f]{6}|rgba?\([^)]*\))$/i.test(normalized) ? normalized : fallback;
}

/**
 * Produces contrast-safe category colors for both themes while preserving
 * admin-managed category identity. Feature screens must consume this helper
 * rather than trusting a light-only category background directly.
 */
export function getCategoryAppearance(category: CategoryAppearanceInput, theme: AthooTheme) {
  const accent = readableAccent(category.color || theme.colors.primary, theme);
  const softFallback = withAlpha(accent, theme.dark ? 0.2 : 0.1);
  const background = theme.dark
    ? softFallback
    : safeLightBackground(category.bgColor, softFallback);
  const selectedBackground = withAlpha(accent, theme.dark ? 0.32 : 0.16);
  const onAccent = contrastRatio(theme.colors.onBrand, accent) >= 4.5
    ? theme.colors.onBrand
    : theme.colors.onLight;

  return Object.freeze({
    accent,
    background,
    selectedBackground,
    text: theme.colors.text,
    onAccent,
  });
}
