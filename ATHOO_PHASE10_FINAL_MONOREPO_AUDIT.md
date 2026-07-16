# Athoo Phase 10 — Final Deep Monorepo Audit

**Audit date:** 16 July 2026  
**Audited baseline:** `ATHOO_PHASE9_PRODUCTION_CERTIFICATION_READY.zip`  
**New source candidate:** `ATHOO_PHASE10_FINAL_MONOREPO_AUDITED.zip`  
**Release decision:** `CONDITIONAL-NO-GO` until connected infrastructure and physical-device evidence pass.

## 1. Audit scope

This was a new full-monorepo audit rather than a review limited to previously reported defects. The review covered all nine workspaces and the complete customer, provider, administrator, API, database, storage, realtime, deployment, security and release-tooling surfaces.

The audited repository contains:

- 9 package workspaces
- 392 TypeScript/TSX/JavaScript application source files across API, admin and mobile
- 41 ordered production SQL migration files
- API, admin panel, Expo mobile app, shared libraries, database tooling, CI/release scripts and deployment blueprints

The audit specifically searched for authorization bypasses, unsafe data projection, injection, private-file exposure, stale/dead routes, hardcoded vendors, broken runtime contracts, websocket lifetime problems, resource exhaustion, insecure fallbacks, missing route guards, unsafe exports, migration drift, test-environment dependence and false release-certification assumptions.

## 2. Critical and high-impact findings corrected

### A. Configuration-first architecture violations

**Problem:** EAS profiles and the Expo app configuration embedded deployment/provider-specific values, including API/provider choices and a fallback EAS project identity. This made future provider changes difficult and could build an app against the wrong backend.

**Correction:** EAS project identity, API origin, map provider and release-specific values now come from deployment configuration. Root and app EAS profiles remain synchronized and the release validator rejects committed deployment-specific values.

### B. Private upload trust boundary

**Problem:** Upload approval trusted client-declared size, completion did not fully revalidate the stored object, and privacy could be inferred from a filename. An oversized or incorrectly scoped object could therefore pass the initial signing path.

**Correction:** Upload scope is explicit (`private` or `shared`), sensitive customer/provider/admin evidence callers request private scope, R2 signing includes the expected length, completion checks the actual stored object size/type, reapplies policy, and deletes invalid objects before returning success.

### C. Sensitive data projection risk

**Problem:** A dormant backend route contained broad `row_to_json(user)` style projection. Although not mounted, later reuse could expose password hashes, push tokens or internal administrative fields. Other safe-user paths still included internal notification/admin lock state.

**Correction:** The dormant broad route was removed. Verification/auth/admin user responses now return explicit fields and safe-user sanitizers remove passwords, Expo tokens and internal lockout counters.

### D. Admin authorization gaps

**Problem:** Several sensitive admin pages could be opened directly without equivalent route guards, and some backend read/write endpoints used inconsistent or missing permission checks.

**Correction:** Route guards now protect plans, administrator management, blacklist and emergency contacts. Sidebar visibility matches route authorization. Emergency contacts, leads and reported-issue endpoints now use canonical read/write permissions. Super-admin-only pages are enforced at the router, not only hidden in navigation.

### E. Unsafe announcement and external links

**Problem:** Marketing actions could retain unsafe schemes, and the mobile app opened announcement links without a strict allowlist.

**Correction:** Backend validation accepts only safe internal app destinations or HTTPS URLs. Existing output is sanitized, and mobile navigation opens only validated internal/HTTPS actions.

### F. HTML and CSV injection

**Problem:** Dynamic invoice/lead values were interpolated into printable HTML and CSV exports without complete neutralization. This created browser injection and spreadsheet formula risks.

**Correction:** Central HTML escaping and spreadsheet-cell neutralization were added. Admin invoice printing avoids inline script and opener access. Booking, invoice, audit-log and lead exports use a shared safe CSV builder with UTF-8 BOM support.

### G. Raw server diagnostics reaching mobile users

**Problem:** Mobile API errors could include raw server response bodies. Many screens display `error.message`, so internal diagnostics could leak into customer/provider UI.

**Correction:** Mobile API errors now expose only a bounded user-safe message, status and code. Call errors use the same safe mapping.

### H. Realtime and call connection lifetime

**Problem:** WebSocket authentication did not uniformly contain asynchronous failures, active sockets were not capped per session, and call sockets could remain usable after a call was no longer active.

**Correction:** Event/call sockets have bounded per-session connection counts, idempotent cleanup, binary-message rejection, guarded async authentication and periodic active-session validation. Call rooms revalidate both participant membership and active call status during heartbeat and close when the call ends.

### I. HTTP resource-limit configuration

**Problem:** Header/request timeout defaults were ordered poorly and were not fully deployment controlled.

**Correction:** Request, header and keep-alive timeouts now use validated bounded environment configuration with safe ordering. Render and production examples include the controls.

### J. Non-cryptographic public ID fallbacks

**Problem:** Some public fallback identifiers used `Math.random`, which is unsuitable for collision-resistant externally visible IDs.

**Correction:** Public fallbacks now use `crypto.randomInt` or `randomUUID`.

### K. Unsafe local/deployment defaults

**Problem:** The local Docker blueprint exposed PostgreSQL/Redis broadly, used a fixed weak password and referenced an example production file. Web deployment blueprints lacked a strong CSP.

**Correction:** Docker is explicitly local-only, binds PostgreSQL to loopback, requires a supplied strong password and removes unused Redis. Vercel and nginx include CSP and cross-origin hardening headers.

### L. False CI/test dependence on working directory

**Problem:** Several source tests passed only when launched from `api-server`; the documented repository-root command produced false failures.

**Correction:** Shared repository path helpers make tests location independent. Both repository-root and API-package execution now pass the same complete suite.

### M. Dynamic code execution workaround

**Problem:** the offline banner used `Function(...)` to dynamically load NetInfo even though NetInfo is a declared mobile dependency.

**Correction:** It now uses a normal static import, eliminating dynamic code execution and improving bundler predictability.

## 3. Additional hardening completed

- Runtime support, social, download and legal URLs are normalized to safe HTTPS values.
- Mobile invoice browser windows use `noopener`/`noreferrer` and explicitly clear `opener`.
- A broken/dead mobile video upload helper now uses the same verified upload pipeline.
- Admin protected uploads include device identity and completion verification.
- Production security scanning now checks for private keys, access keys, committed secrets, dynamic execution, unsafe user projections, raw mobile responses, dead broad routes and committed EAS deployment values.
- Release blueprint validation now verifies EAS configurability, CSP, nginx, Docker and HTTP/WebSocket resource controls.
- Ten new final-audit regression tests protect these findings from reappearing.

## 4. Validation evidence

### Passed in the extracted source candidate

- Final-audit targeted regression tests: **10/10 passed**
- Complete root-level API/source regression suite: **441/441 passed**
- Complete API-package regression suite: **441/441 passed**
- Project JSON validation: passed
- Release configuration validation: passed
- Operations/runbook validation: passed
- Release blueprint validation: passed
- Security scan: passed
- Expo workspace validation: passed
- React Native style-key validation: passed
- Mobile release validation: passed
- Closed-beta QA validation: passed
- Device-acceptance preparation validation: passed

### Not executable in this isolated environment

The clean source ZIP intentionally excludes dependencies, and the npm registry was unreachable from this environment. Therefore the following cannot be honestly certified here:

- `pnpm install --frozen-lockfile`
- registry-backed dependency vulnerability audit
- full workspace TypeScript typecheck
- API and admin production builds
- Metro module loading and Expo export
- connected Neon migration/constraint verification
- Render, Vercel and Cloudflare R2 runtime behavior
- Expo push receipts and fresh native channels/sounds
- TURN calls and physical Android/iPhone behavior

These remain mandatory, non-waivable connected gates.

## 5. Release status

The source candidate is substantially stronger than Phase 9 and is suitable to become the new canonical baseline. It is **not yet approved for public production launch**.

Launch remains `CONDITIONAL-NO-GO` until all of the following produce evidence from the exact Phase 10 Git commit and ZIP:

1. Frozen dependency installation, vulnerability audit, typecheck and production builds.
2. Neon backup, all migrations, migration checksum verification and integrity checks.
3. Exact-commit Render API and Vercel admin deployments.
4. R2 private/shared upload and authenticated-read tests.
5. Fresh EAS Android and iOS builds.
6. Customer job broadcast visibly received by an eligible provider in foreground, background and terminated states.
7. Chat delivery/read badges, message sound and keyboard behavior on both phones.
8. Two-way voice call over different networks with TURN, mute and audio routing.
9. One-device replacement, biometric restore/relock and logout restart behavior.
10. Admin notification opening the exact operational record.
11. Legal approval of governed policies, production-secret rotation, monitoring/escalation activation and hosting-capacity approval.
12. Zero open P0/P1 defects and final decision command returning `GO`.

## 6. Canonical baseline rule

After the Phase 10 ZIP is packaged and re-extracted successfully, it replaces Phase 9 as the only baseline. No file from an older ZIP should be merged into it manually.
