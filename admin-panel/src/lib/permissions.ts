import type { AdminUser } from "@/lib/types";

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

const PERMISSION_ALIASES: Record<string, string> = {
  "operations.read": "bookings.read",
  "operations.write": "bookings.write",
  "providers.read": "verification.read",
  "providers.write": "verification.write",
  "support.read": "complaints.read",
  "support.write": "complaints.write",
  "broadcast.read": "broadcasts.read",
  "broadcast.write": "broadcasts.write",
};

export function canonicalPermission(permission: string): string {
  return PERMISSION_ALIASES[permission] || permission;
}

export function hasAdminUiPermission(admin: AdminUser | null | undefined, permission?: string): boolean {
  if (!permission) return true;
  if (!admin || admin.role !== "admin") return false;
  if (admin.adminRole === "super_admin") return true;

  const canonical = canonicalPermission(permission);
  const rolePermissions = ADMIN_ROLE_PERMISSIONS[admin.adminRole || ""] || [];
  const customPermissions = Array.isArray(admin.adminPermissions) ? admin.adminPermissions : [];
  const [resource] = canonical.split(".");

  return [rolePermissions, customPermissions].some((permissions) =>
    permissions.includes("*") ||
    permissions.includes(canonical) ||
    permissions.includes(permission) ||
    permissions.includes(`${resource}.*`)
  );
}
