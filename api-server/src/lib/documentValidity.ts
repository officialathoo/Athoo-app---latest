export type ExpiringDocumentType = "cnic_front" | "cnic_back" | "police";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: unknown, fieldName: string, required: boolean): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    if (required) throw new Error(`${fieldName} is required`);
    return null;
  }
  if (!DATE_ONLY_PATTERN.test(raw)) throw new Error(`${fieldName} must use YYYY-MM-DD`);
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${fieldName} is invalid`);
  }
  return parsed;
}

export function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function readBoolean(value: unknown): boolean {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

export function validateDocumentValidity(input: {
  documentType: ExpiringDocumentType;
  issuedAt?: unknown;
  expiresAt?: unknown;
  expiryNotApplicable?: unknown;
}, options: { allowExpired?: boolean } = {}) {
  const expiryNotApplicable = readBoolean(input.expiryNotApplicable);
  if (input.documentType === "police" && expiryNotApplicable) {
    throw new Error("Police verification requires a valid-until date");
  }

  const rawExpiry = typeof input.expiresAt === "string" ? input.expiresAt.trim() : "";
  if (expiryNotApplicable && rawExpiry) {
    throw new Error("Do not enter a valid-until date when the CNIC is marked lifetime");
  }

  const issuedAt = parseDateOnly(
    input.issuedAt,
    "Issue date",
    input.documentType === "police",
  );
  const expiresAt = expiryNotApplicable
    ? null
    : parseDateOnly(input.expiresAt, "Valid-until date", true);

  const today = new Date().toISOString().slice(0, 10);
  const issuedDate = dateOnly(issuedAt);
  const expiryDate = dateOnly(expiresAt);

  if (issuedDate && issuedDate > today) throw new Error("Issue date cannot be in the future");
  if (!options.allowExpired && expiryDate && expiryDate < today) {
    throw new Error("Valid-until date must be today or later");
  }
  if (issuedDate && expiryDate && issuedDate > expiryDate) {
    throw new Error("Issue date cannot be after the valid-until date");
  }

  return { issuedAt, expiresAt, expiryNotApplicable };
}
