const MIME_ALIASES: Record<string, string> = {
  "video/mov": "video/quicktime",
  "video/x-m4v": "video/mp4",
};

export function normalizeUploadMime(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  return MIME_ALIASES[normalized] || normalized;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectUploadContentType(prefix: Uint8Array): string | null {
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    prefix.length >= 8 &&
    prefix[0] === 0x89 && prefix[1] === 0x50 && prefix[2] === 0x4e && prefix[3] === 0x47 &&
    prefix[4] === 0x0d && prefix[5] === 0x0a && prefix[6] === 0x1a && prefix[7] === 0x0a
  ) {
    return "image/png";
  }
  if (prefix.length >= 12 && ascii(prefix, 0, 4) === "RIFF" && ascii(prefix, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (prefix.length >= 5 && ascii(prefix, 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  if (prefix.length >= 12 && ascii(prefix, 4, 4) === "ftyp") {
    const majorBrand = ascii(prefix, 8, 4);
    if (majorBrand === "qt  ") return "video/quicktime";

    // ISO Base Media is also used by HEIC/HEIF, AVIF, audio-only M4A and 3GP.
    // Treating every `ftyp` container as MP4 lets unsupported files pass a
    // renamed .mp4 check. Only explicit video-oriented MP4 brands are allowed.
    const mp4VideoBrands = new Set([
      "isom", "iso2", "iso3", "iso4", "iso5", "iso6",
      "mp41", "mp42", "avc1", "dash", "M4V ", "MSNV",
    ]);
    const explicitlyForbiddenBrands = new Set([
      "heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1",
      "avif", "avis", "M4A ", "M4B ", "M4P ", "3gp4", "3gp5", "3gp6", "3g2a", "3g2b",
    ]);
    if (explicitlyForbiddenBrands.has(majorBrand)) return null;
    return mp4VideoBrands.has(majorBrand) ? "video/mp4" : null;
  }
  return null;
}

export function uploadContentTypeMatches(declared: unknown, detected: unknown): boolean {
  return Boolean(detected) && normalizeUploadMime(declared) === normalizeUploadMime(detected);
}

export function activeContentPatternsFor(contentType: unknown): RegExp[] {
  const normalized = normalizeUploadMime(contentType);
  if (normalized === "application/pdf") {
    return [
      /\/javascript\b/i,
      /\/js\b/i,
      /\/launch\b/i,
      /\/embeddedfile\b/i,
      /\/openaction\b/i,
      /\/richmedia\b/i,
      /\/xfa\b/i,
      /<script\b/i,
      /<\?php/i,
    ];
  }
  if (normalized.startsWith("image/")) {
    return [/<script\b/i, /<\?php/i, /<!doctype\s+html/i, /<html\b/i, /javascript\s*:/i];
  }
  return [];
}
