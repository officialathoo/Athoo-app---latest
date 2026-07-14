import { useAdmin } from "@/hooks/useAdmin";
import { hasAdminUiPermission } from "@/lib/permissions";

export function usePermissions() {
  const { admin } = useAdmin();
  const adminRole = admin?.adminRole || "";
  const adminPermissions: string[] = Array.isArray(admin?.adminPermissions) ? admin.adminPermissions : [];

  function hasPermission(permission: string): boolean {
    return hasAdminUiPermission(admin, permission);
  }

  function hasRole(...roles: string[]): boolean {
    return Boolean(admin && roles.includes(adminRole));
  }

  function isSuperAdmin(): boolean {
    return adminRole === "super_admin";
  }

  function canRead(resource: string): boolean {
    return hasPermission(`${resource}.read`);
  }

  function canWrite(resource: string): boolean {
    return hasPermission(`${resource}.write`);
  }

  return { hasPermission, hasRole, isSuperAdmin, canRead, canWrite, adminRole, adminPermissions };
}
