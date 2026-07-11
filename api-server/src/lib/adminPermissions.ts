export const ADMIN_ROLES = ["super_admin", "ops", "finance", "support", "marketing", "technical"] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export const ADMIN_PERMISSIONS = [
  "dashboard.read", "notifications.read", "notifications.write",
  "users.read", "users.write", "providers.write",
  "bookings.read", "bookings.write", "operations.read", "operations.write",
  "verification.read", "verification.write",
  "complaints.read", "complaints.write", "support.read", "support.write",
  "broadcasts.read", "broadcasts.write",
  "finance.read", "finance.write", "reports.read", "export.read", "audit.read",
  "promotions.read", "promotions.write", "marketing.read", "marketing.write",
  "settings.read", "settings.write",
] as const;

export const ADMIN_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: ["*"],
  ops: [
    "dashboard.read", "notifications.read", "users.read", "users.write", "providers.write",
    "bookings.read", "bookings.write", "operations.read", "operations.write",
    "verification.read", "verification.write", "complaints.read", "complaints.write",
    "broadcasts.read", "broadcasts.write", "reports.read", "audit.read",
  ],
  finance: [
    "dashboard.read", "notifications.read", "users.read", "bookings.read",
    "finance.read", "finance.write", "reports.read", "export.read", "audit.read", "settings.read",
  ],
  support: [
    "dashboard.read", "notifications.read", "users.read", "bookings.read",
    "complaints.read", "complaints.write", "support.read", "support.write", "broadcasts.read",
  ],
  marketing: [
    "dashboard.read", "notifications.read", "notifications.write", "marketing.read", "marketing.write",
    "promotions.read", "promotions.write", "broadcasts.read", "broadcasts.write", "reports.read",
  ],
  technical: [
    "dashboard.read", "notifications.read", "users.read", "bookings.read", "operations.read",
    "reports.read", "export.read", "audit.read", "settings.read", "settings.write",
  ],
};

export function validateAdminPermissions(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const allowed = new Set<string>(ADMIN_PERMISSIONS);
  const unique = [...new Set(value)];
  return unique.every((permission) => allowed.has(permission)) ? unique : null;
}

export function hasAdminPermission(input: { role?: string; adminRole?: string; adminPermissions?: string[] }, permission: string): boolean {
  if (input.role !== "admin") return false;
  if (input.adminRole === "super_admin") return true;
  const rolePermissions = ADMIN_ROLE_PERMISSIONS[input.adminRole || ""] || [];
  const customPermissions = Array.isArray(input.adminPermissions) ? input.adminPermissions : [];
  const [resource] = permission.split(".");
  return [rolePermissions, customPermissions].some((permissions) =>
    permissions.includes("*") || permissions.includes(permission) || permissions.includes(`${resource}.*`)
  );
}
