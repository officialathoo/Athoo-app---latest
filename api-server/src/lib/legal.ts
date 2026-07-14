/**
 * Server-authoritative legal version.
 *
 * The current Terms of Service / Privacy Policy version that all users must have
 * accepted. The server NEVER trusts a client-supplied `legalVersion`: registration
 * and the `/api/me/legal-accept` endpoint both stamp this exact string onto the
 * user row. Bumping this constant (and the corresponding mobile `LEGAL_VERSION`
 * in `components/ui/LegalAcceptanceCheckbox.tsx`) triggers the in-app re-consent
 * gate for every signed-in user whose stored value no longer matches.
 *
 * Format: free-form short string (e.g. "1.0", "2025-05-12"). Capped at 32 chars.
 */
export const LEGAL_VERSION = "1.0";
