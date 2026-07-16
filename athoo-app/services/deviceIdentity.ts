import { getSecureItem, setSecureItem } from "@/services/secureSessionStorage";

const DEVICE_ID_KEY = "athoo_device_id";
let cachedDeviceId: string | null = null;
let deviceIdPromise: Promise<string> | null = null;

function createDeviceId(): string {
  const cryptoApi = (globalThis as any).crypto as { randomUUID?: () => string; getRandomValues?: (values: Uint8Array) => Uint8Array } | undefined;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeDeviceId(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{15,127}$/.test(normalized) ? normalized : "";
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (deviceIdPromise) return deviceIdPromise;

  deviceIdPromise = (async () => {
    const existing = normalizeDeviceId(await getSecureItem(DEVICE_ID_KEY));
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }

    const generated = createDeviceId().toLowerCase();
    await setSecureItem(DEVICE_ID_KEY, generated);
    cachedDeviceId = generated;
    return generated;
  })().finally(() => {
    deviceIdPromise = null;
  });

  return deviceIdPromise;
}
