# RC2 Final Typecheck Fix

Resolved the final API TypeScript errors reported on Windows:

- `auth.ts`: the OTP failure handler now returns the Express response, satisfying `noImplicitReturns`.
- `geo.ts`: Photon, Nominatim, and OSRM JSON payloads now have explicit response types under TypeScript's `Response.json(): unknown` typing.
- Added a focused regression test to prevent these errors from returning.

Verification performed in the source package:

- Project validation passed.
- Complete source regression suite passed: 311/311 tests.
- Focused TypeScript diagnostic check found none of TS7030, TS2322, or TS18046 in the changed routes.

Run the full dependency-backed workspace typecheck locally after extraction.
