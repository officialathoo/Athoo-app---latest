#!/usr/bin/env node
const base = String(process.env.RC_API_BASE_URL || "").replace(/\/$/, "");
const timeoutMs = Number(process.env.RC_SMOKE_TIMEOUT_MS || 15000);
if (!base) throw new Error("RC_API_BASE_URL is required");
if (!/^https?:\/\//.test(base)) throw new Error("RC_API_BASE_URL must start with http:// or https://");
if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
  throw new Error("RC_API_BASE_URL must use HTTPS unless it points to localhost");
}

const credentials = {
  customer: [process.env.RC_CUSTOMER_IDENTIFIER, process.env.RC_CUSTOMER_PASSWORD],
  provider: [process.env.RC_PROVIDER_IDENTIFIER, process.env.RC_PROVIDER_PASSWORD],
  admin: [process.env.RC_ADMIN_IDENTIFIER, process.env.RC_ADMIN_PASSWORD],
};

async function request(path, init = {}, expected = [200]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!expected.includes(response.status)) {
      throw new Error(`${path}: expected ${expected.join("/")}, received ${response.status}: ${body.error || ""}`);
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function login(role) {
  const [identifier, password] = credentials[role];
  if (!identifier || !password) throw new Error(`Missing RC ${role} credentials`);
  const path = role === "admin" ? "/api/auth/admin-login" : "/api/auth/login";
  const { body } = await request(path, { method: "POST", body: JSON.stringify({ identifier, password }) });
  if (!body.token) throw new Error(`${role} login returned no access token`);
  return { authorization: `Bearer ${body.token}` };
}

await request("/api/healthz/deep");
await request("/api/categories");
await request("/api/marketing/home-config");

const customerHeaders = await login("customer");
const providerHeaders = await login("provider");
const adminHeaders = await login("admin");

const customerMe = await request("/api/auth/me", { headers: customerHeaders });
if (customerMe.body?.user?.role !== "customer") throw new Error("Customer identity endpoint returned the wrong role");
const providerMe = await request("/api/auth/me", { headers: providerHeaders });
if (providerMe.body?.user?.role !== "provider") throw new Error("Provider identity endpoint returned the wrong role");
const adminMe = await request("/api/admin/me", { headers: adminHeaders });
if (!adminMe.body?.user && !adminMe.body?.admin) throw new Error("Admin identity endpoint returned no administrator");

await request("/api/providers/dashboard", { headers: providerHeaders });
await request("/api/providers/dashboard", { headers: customerHeaders }, [403]);
await request("/api/admin/dashboard", { headers: adminHeaders });
await request("/api/admin/dashboard", { headers: customerHeaders }, [403]);
await request("/api/admin/dashboard", { headers: providerHeaders }, [403]);

console.log("RC cross-role workflow smoke passed without creating or mutating business records.");
