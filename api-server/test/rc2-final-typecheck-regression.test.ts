import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
const photon = fs.readFileSync(new URL("../src/maps/providers/photon.ts", import.meta.url), "utf8");
const nominatim = fs.readFileSync(new URL("../src/maps/providers/nominatim.ts", import.meta.url), "utf8");
const osrm = fs.readFileSync(new URL("../src/maps/providers/osrm.ts", import.meta.url), "utf8");
const tomtom = fs.readFileSync(new URL("../src/maps/providers/tomtom.ts", import.meta.url), "utf8");

test("send OTP handler returns its failure response", () => {
  assert.match(auth, /return res\.status\(500\)\.json\(\{ error: "We could not send the verification code\. Please try again\.", code: "OTP_SEND_FAILED" \}\)/);
});

test("map provider upstream JSON payloads have explicit response types", () => {
  assert.match(photon, /interface PhotonResponse/);
  assert.match(photon, /as PhotonResponse/);
  assert.match(nominatim, /interface NominatimItem/);
  assert.match(nominatim, /as NominatimItem/);
  assert.match(osrm, /interface OsrmResponse/);
  assert.match(osrm, /as OsrmResponse/);
  assert.match(tomtom, /interface TomTomSearchResponse/);
  assert.match(tomtom, /interface TomTomRouteResponse/);
});
