export type JsonRecord = Record<string, unknown>;

export function envValue(name: string, fallback = ""): string {
  return String(process.env[name] ?? fallback).trim();
}

export function envInteger(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(envValue(name));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

export function envJsonObject(name: string): JsonRecord {
  const raw = envValue(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

export function readPath(value: unknown, path: string): unknown {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return value;
  return normalizedPath
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current == null) return undefined;
      if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
      if (typeof current === "object") return (current as Record<string, unknown>)[segment];
      return undefined;
    }, value);
}

export function parseJsonTemplate(raw: string): unknown | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stringifyTemplateValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function renderJsonTemplate(
  template: unknown,
  stringTokens: Record<string, unknown>,
  rawTokens: Record<string, unknown> = {},
): unknown {
  if (Array.isArray(template)) {
    return template.map((entry) => renderJsonTemplate(entry, stringTokens, rawTokens));
  }
  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template as Record<string, unknown>)
        .map(([key, value]) => [key, renderJsonTemplate(value, stringTokens, rawTokens)]),
    );
  }
  if (typeof template !== "string") return template;
  if (Object.prototype.hasOwnProperty.call(rawTokens, template)) return rawTokens[template];
  let output = template;
  for (const [key, value] of Object.entries(stringTokens)) {
    output = output.replaceAll(`{${key}}`, stringifyTemplateValue(value));
  }
  return output;
}

export function buildHttpHeaders(options: {
  defaultContentType?: string;
  headersJsonEnv?: string;
  authHeaderEnv?: string;
  authValueEnv?: string;
  authPrefixEnv?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.defaultContentType) headers["content-type"] = options.defaultContentType;

  const configuredHeaders = options.headersJsonEnv ? envJsonObject(options.headersJsonEnv) : {};
  for (const [key, value] of Object.entries(configuredHeaders)) {
    if (/^[A-Za-z0-9-]{1,100}$/.test(key) && ["string", "number", "boolean"].includes(typeof value)) {
      headers[key] = String(value);
    }
  }

  const authHeader = options.authHeaderEnv ? envValue(options.authHeaderEnv) : "";
  const authValue = options.authValueEnv ? envValue(options.authValueEnv) : "";
  const authPrefix = options.authPrefixEnv ? envValue(options.authPrefixEnv) : "";
  if (authHeader && authValue && /^[A-Za-z0-9-]{1,100}$/.test(authHeader)) {
    headers[authHeader] = authPrefix ? `${authPrefix}${authValue}` : authValue;
  }
  return headers;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
