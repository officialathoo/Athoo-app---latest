import { useState, useEffect, useCallback } from "react";
import { api, getToken, saveSessionTokens, clearToken, setApiBase } from "@/lib/api";
import type { AdminUser } from "@/lib/types";

interface AdminState {
  token: string;
  admin: AdminUser | null;
  loading: boolean;
}

interface UseAdminReturn extends AdminState {
  login: (identifier: string, password: string, apiBase: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAdmin(): UseAdminReturn {
  const [state, setState] = useState<AdminState>({
    token: getToken(),
    admin: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setState({ token: "", admin: null, loading: false });
      return;
    }
    try {
      const data = await api<{ admin: AdminUser }>("/api/admin/me");
      setState({ token: getToken(), admin: data.admin ?? null, loading: false });
    } catch {
      clearToken();
      setState({ token: "", admin: null, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (identifier: string, password: string, apiBaseUrl: string) => {
      setApiBase(apiBaseUrl);
      const data = await api<{ token: string; refreshToken: string; user: AdminUser }>("/api/auth/admin-login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      if (!data.user || data.user.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }
      if (!data.refreshToken) throw new Error("Admin session refresh token was not returned.");
      saveSessionTokens(data.token, data.refreshToken);
      setState({ token: data.token, admin: data.user, loading: false });
    },
    []
  );

  const logout = useCallback(async () => {
    const hadToken = Boolean(getToken());
    try {
      if (hadToken) await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Local logout must always complete even if the server is unavailable.
    } finally {
      clearToken();
      setState({ token: "", admin: null, loading: false });
    }
  }, []);

  return { ...state, login, logout, refresh };
}

