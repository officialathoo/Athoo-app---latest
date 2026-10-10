import type { AdminUser } from "@/lib/types";

export const ADMIN_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  super_admin: ["*"],
  ops: [
    "dashboard.read", "notifications.read", "notifications.write", "notifications.manage", "users.read", "users.write", "providers.read", "providers.write", "providers.verification",
    "bookings.read", "bookings.write", "bookings.cancel", "bookings.reassign", "operations.read", "operations.write",
    "verification.read", "verification.write", "complaints.read", "complaints.write",
    "broadcasts.read", "broadcasts.write", "reports.read", "reports.export", "audit.read", "audit.full", "log.view",
  ],
  finance: [
    "dashboard.read", "notifications.read", "users.read", "bookings.read",
    "finance.read", "finance.write", "reports.read", "reports.export", "export.read", "export.write", "audit.read", "audit.full", "log.view", "settings.read",
  ],
  support: [
    "dashboard.read", "notifications.read", "notifications.manage", "users.read", "bookings.read",
    "complaints.read", "complaints.write", "support.read", "support.write", "broadcasts.read", "reports.read", "audit.read", "log.view",
  ],
  marketing: [
    "dashboard.read", "notifications.read", "notifications.write", "notifications.manage", "marketing.read", "marketing.write",
    "promotions.read", "promotions.write", "broadcasts.read", "broadcasts.write", "reports.read", "reports.export", "audit.read", "log.view",
  ],
  technical: [
    "dashboard.read", "notifications.read", "notifications.manage", "users.read", "bookings.read", "operations.read",
    "reports.read", "reports.export", "export.read", "export.write", "audit.read", "audit.full", "log.view", "settings.read", "settings.write", "settings.full",
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
