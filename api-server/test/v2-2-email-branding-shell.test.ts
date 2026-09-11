import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/lib/emailTemplates.ts", import.meta.url),
  "utf8",
);

test("email shell exposes production branding controls", () => {
  assert.match(source, /EMAIL_LOGO_URL/);
  assert.match(source, /EMAIL_WEBSITE_URL/);
  assert.match(source, /EMAIL_SUPPORT_ADDRESS/);
  assert.match(source, /EMAIL_BRAND_ACCENT_COLOR/);
  assert.match(source, /\$\{escapeHtml\(brandName\)\} Team/);
  assert.match(source, /Security reminder:/);
  assert.match(source, /All rights reserved/);
});

test("email shell uses an HTTPS-only remote logo path", () => {
  assert.match(source, /const logoUrl = env\("EMAIL_LOGO_URL"\)/);
  assert.match(source, /<img src=/);
  assert.match(source, /https:/);
  assert.doesNotMatch(source, /data:image/i);
  assert.doesNotMatch(source, /javascript:/i);
});

test("security OTP templates receive dedicated six-digit styling", () => {
  for (const key of [
    "email_verification",
    "email_login_otp",
    "registration_otp",
    "password_reset",
    "account_action_otp",
  ]) {
    assert.match(source, new RegExp(`"${key}"`));
  }
  assert.match(source, /letter-spacing:6px/);
});

test("marketing unsubscribe and provider-neutral rendering remain intact", () => {
  assert.match(source, /category === "marketing"/);
  assert.match(source, /unsubscribe from promotional emails/);
  assert.match(source, /notificationTemplatesTable/);
  assert.match(source, /source: "database" \| "built-in"/);
});