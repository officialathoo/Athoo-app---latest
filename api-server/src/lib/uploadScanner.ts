import { createHash } from "node:crypto";
import { Readable, Transform, Writable, type TransformCallback } from "node:stream";
import { finished, pipeline } from "node:stream/promises";
import type { StoredObjectResponse } from "./storageProvider";
import {
  activeContentPatternsFor,
  detectUploadContentType,
  normalizeUploadMime,
  uploadContentTypeMatches,
} from "./uploadContentPolicy";

const PREFIX_LIMIT = 64 * 1024;
const RESPONSE_LIMIT = 8 * 1024;
let activeExternalScans = 0;

export type UploadScanResult = {
  clean: boolean;
  reason?: "content_type_mismatch" | "active_content" | "malware_detected";
  detectedContentType: string | null;
  sha256: string;
  size: number;
  scanner: string;
};

export class UploadScanUnavailableError extends Error {
  readonly reasonCode: "scanner_not_configured" | "scanner_busy" | "scanner_unavailable" | "scanner_invalid_response";

  constructor(reasonCode: "scanner_not_configured" | "scanner_busy" | "scanner_unavailable" | "scanner_invalid_response") {
    super("Upload security scanning is temporarily unavailable");
    this.name = "UploadScanUnavailableError";
    this.reasonCode = reasonCode;
  }
}

class InspectionTransform extends Transform {
  private readonly hash = createHash("sha256");
  private readonly prefixChunks: Buffer[] = [];
  private readonly patterns: RegExp[];
  private prefixLength = 0;
  private tail = "";
  private suspicious = false;
  private total = 0;
  private readonly maxBytes: number;

  constructor(contentType: string, maxBytes: number) {
    super();
    this.patterns = activeContentPatternsFor(contentType);
    this.maxBytes = maxBytes;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.total += bytes.length;
    if (this.total > this.maxBytes) {
      callback(new Error("UPLOAD_STREAM_SIZE_LIMIT"));
      return;
    }
    this.hash.update(bytes);
    if (this.prefixLength < PREFIX_LIMIT) {
      const retained = bytes.subarray(0, Math.min(bytes.length, PREFIX_LIMIT - this.prefixLength));
      this.prefixChunks.push(retained);
      this.prefixLength += retained.length;
    }
    if (this.patterns.length && !this.suspicious) {
      const searchable = `${this.tail}${bytes.toString("latin1")}`;
      this.suspicious = this.patterns.some((pattern) => pattern.test(searchable));
      this.tail = searchable.slice(-128);
    }
    callback(null, bytes);
  }

  summary(): { prefix: Buffer; sha256: string; size: number; suspicious: boolean } {
    return {
      prefix: Buffer.concat(this.prefixChunks, this.prefixLength),
      sha256: this.hash.digest("hex"),
      size: this.total,
      suspicious: this.suspicious,
    };
  }
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function scannerMode(): "required" | "signature-only" {
  if (["production", "staging"].includes(String(process.env.NODE_ENV || "").trim().toLowerCase())) return "required";
  return String(process.env.UPLOAD_SCAN_MODE || "signature-only").trim().toLowerCase() === "required"
    ? "required"
    : "signature-only";
}

function scannerConfiguration(): { mode: "required" | "signature-only"; url: string; token: string; timeoutMs: number; maxConcurrency: number } {
  return {
    mode: scannerMode(),
    url: String(process.env.UPLOAD_SCANNER_URL || "").trim(),
    token: String(process.env.UPLOAD_SCANNER_TOKEN || "").trim(),
    timeoutMs: boundedInteger(process.env.UPLOAD_SCAN_TIMEOUT_MS, 90_000, 5_000, 240_000),
    maxConcurrency: boundedInteger(process.env.UPLOAD_SCAN_MAX_CONCURRENCY, 2, 1, 20),
  };
}

export function getUploadScannerStatus(): { mode: string; configured: boolean; productionSafe: boolean } {
  const config = scannerConfiguration();
  let validUrl = false;
  try {
    const parsed = new URL(config.url);
    validUrl = parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {}
  const configured = validUrl && config.token.length >= 24;
  return { mode: config.mode, configured, productionSafe: config.mode === "required" && configured };
}

const SCANNER_CONNECTIVITY_PROBE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const EICAR_CONNECTIVITY_PROBE = Buffer.from(
  [
    "X5O!P%@AP[4",
    String.fromCharCode(92),
    "PZX54(P^)7CC)7}$EICAR-",
    "STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  ].join(""),
  "ascii",
);

export async function testConfiguredUploadScanner(): Promise<{
  ok: boolean;
  configured: boolean;
  productionSafe: boolean;
  scanner?: string;
  latencyMs: number;
  detectedContentType?: string | null;
  cleanProbeAccepted?: boolean;
  eicarProbeRejected?: boolean;
  error?: string;
}> {
  const status = getUploadScannerStatus();
  const startedAt = Date.now();
  if (!status.productionSafe) {
    return {
      ok: false,
      configured: status.configured,
      productionSafe: status.productionSafe,
      latencyMs: Date.now() - startedAt,
      error: "scanner_not_production_safe",
    };
  }

  try {
    const cleanResult = await scanStoredUpload({
      object: {
        body: Readable.from(SCANNER_CONNECTIVITY_PROBE),
        contentType: "image/png",
        contentLength: SCANNER_CONNECTIVITY_PROBE.length,
      },
      declaredContentType: "image/png",
      expectedSize: SCANNER_CONNECTIVITY_PROBE.length,
      maxBytes: SCANNER_CONNECTIVITY_PROBE.length,
    });
    const eicarInspector = new InspectionTransform("application/octet-stream", EICAR_CONNECTIVITY_PROBE.length);
    const eicarResult = await sendThroughExternalScanner(
      {
        body: Readable.from(EICAR_CONNECTIVITY_PROBE),
        contentType: "application/octet-stream",
        contentLength: EICAR_CONNECTIVITY_PROBE.length,
      },
      eicarInspector,
      "application/octet-stream",
      scannerConfiguration(),
    );
    const cleanProbeAccepted = cleanResult.clean;
    const eicarProbeRejected = eicarResult.clean === false;
    const ok = cleanProbeAccepted && eicarProbeRejected;
    return {
      ok,
      configured: status.configured,
      productionSafe: status.productionSafe,
      scanner: cleanResult.scanner,
      latencyMs: Date.now() - startedAt,
      detectedContentType: cleanResult.detectedContentType,
      cleanProbeAccepted,
      eicarProbeRejected,
      ...(ok ? {} : {
        error: !cleanProbeAccepted
          ? cleanResult.reason || "scanner_rejected_clean_probe"
          : "scanner_accepted_eicar_probe",
      }),
    };
  } catch (error) {
    return {
      ok: false,
      configured: status.configured,
      productionSafe: status.productionSafe,
      latencyMs: Date.now() - startedAt,
      error: error instanceof UploadScanUnavailableError ? error.reasonCode : "scanner_test_failed",
    };
  }
}

async function readBoundedScannerResponse(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > RESPONSE_LIMIT) {
      await reader.cancel();
      throw new UploadScanUnavailableError("scanner_invalid_response");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function sendThroughExternalScanner(
  object: StoredObjectResponse,
  inspector: InspectionTransform,
  contentType: string,
  config: ReturnType<typeof scannerConfiguration>,
): Promise<{ clean: boolean }> {
  const status = getUploadScannerStatus();
  if (!status.configured) throw new UploadScanUnavailableError("scanner_not_configured");
  if (activeExternalScans >= config.maxConcurrency) throw new UploadScanUnavailableError("scanner_busy");
  activeExternalScans += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const inspectedBody = object.body.pipe(inspector);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/octet-stream",
        "X-Athoo-Declared-Content-Type": normalizeUploadMime(contentType),
      },
      body: inspectedBody as any,
      signal: controller.signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await finished(inspector);
    if (!response.ok) throw new UploadScanUnavailableError("scanner_unavailable");
    const raw = await readBoundedScannerResponse(response);
    let result: unknown;
    try { result = JSON.parse(raw); } catch { throw new UploadScanUnavailableError("scanner_invalid_response"); }
    if (!result || typeof result !== "object" || typeof (result as any).clean !== "boolean") {
      throw new UploadScanUnavailableError("scanner_invalid_response");
    }
    return { clean: (result as any).clean };
  } catch (error) {
    object.body.destroy();
    inspector.destroy();
    if (error instanceof UploadScanUnavailableError) throw error;
    throw new UploadScanUnavailableError("scanner_unavailable");
  } finally {
    clearTimeout(timeout);
    activeExternalScans -= 1;
  }
}

export async function scanStoredUpload(input: {
  object: StoredObjectResponse;
  declaredContentType: string;
  expectedSize: number;
  maxBytes: number;
}): Promise<UploadScanResult> {
  const config = scannerConfiguration();
  const inspector = new InspectionTransform(input.declaredContentType, input.maxBytes);
  let malwareClean = true;
  if (config.mode === "required") {
    malwareClean = (await sendThroughExternalScanner(input.object, inspector, input.declaredContentType, config)).clean;
  } else {
    await pipeline(input.object.body, inspector, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
  }

  const inspected = inspector.summary();
  const detectedContentType = detectUploadContentType(inspected.prefix);
  const scanner = config.mode === "required" ? "external-v1" : "signature-only-v1";
  if (inspected.size !== input.expectedSize || !uploadContentTypeMatches(input.declaredContentType, detectedContentType)) {
    return { clean: false, reason: "content_type_mismatch", detectedContentType, sha256: inspected.sha256, size: inspected.size, scanner };
  }
  if (inspected.suspicious) {
    return { clean: false, reason: "active_content", detectedContentType, sha256: inspected.sha256, size: inspected.size, scanner };
  }
  if (!malwareClean) {
    return { clean: false, reason: "malware_detected", detectedContentType, sha256: inspected.sha256, size: inspected.size, scanner };
  }
  return { clean: true, detectedContentType, sha256: inspected.sha256, size: inspected.size, scanner };
}
