import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const geo = fs.readFileSync(new URL("../src/routes/geo.ts", import.meta.url), "utf8");

test("send OTP handler returns its failure response", () => {
  assert.match(auth, /return res\.status\(500\)\.json\(\{ error: "We could not send the verification code\. Please try again\.", code: "OTP_SEND_FAILED" \}\)/);
});

test("open-map upstream JSON payloads have explicit response types", () => {
  assert.match(geo, /interface OsrmResponse/);
  assert.match(geo, /as PhotonResponse/);
  assert.match(geo, /as NominatimItem/);
  assert.match(geo, /as NominatimItem\[\]/);
  assert.match(geo, /as OsrmResponse/);
});
