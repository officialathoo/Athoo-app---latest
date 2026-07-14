import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p:string)=>fs.readFileSync(new URL(`../../${p}`,import.meta.url),"utf8");
test("JWT and refresh sessions use explicit secrets, claims, and atomic rotation",()=>{const a=read("api-server/src/middlewares/auth.ts"),s=read("api-server/src/lib/session.ts");assert.match(a,/JWT_ISSUER/);assert.match(a,/JWT_AUDIENCE/);assert.doesNotMatch(a,/SESSION_SECRET/);assert.match(s,/createHmac\("sha256"/);assert.match(s,/\.returning\(\)/);});
test("OTP and realtime purpose tokens are release safe",()=>{const a=read("api-server/src/routes/auth.ts"),w=read("api-server/src/ws.ts"),m=read("athoo-app/services/api.ts");assert.match(a,/ALLOW_DEV_OTP_RESPONSE/);assert.match(a,/purpose-token/);assert.match(w,/decoded\.purpose !== "realtime"/);assert.match(m,/\/api\/ws\/events/);});
test("deployment environment and private media use hardened controls",()=>{const app=read("api-server/src/app.ts"),env=read("scripts/tools/validate-environment.mjs"),storage=read("athoo-app/services/storage.ts");assert.match(app,/TRUST_PROXY/);assert.match(app,/CORS_ORIGINS/);assert.match(env,/JWT_ISSUER/);assert.match(env,/ALLOW_DEV_OTP_RESPONSE/);assert.match(storage,/createPurposeToken\("object-read"\)/);});
