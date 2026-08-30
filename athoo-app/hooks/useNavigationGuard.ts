import { useRef, useCallback } from "react";
import { router } from "expo-router";

const NAVIGATION_DEBOUNCE_MS = 300;
const lastNavigationRef = new Map<string, number>();

export function useNavigationGuard() {
  const pendingNavigationRef = useRef<string | null>(null);

  const navigate = useCallback(
    (href: string | object, options?: { replace?: boolean }) => {
      const key = typeof href === "string" ? href : JSON.stringify(href);
      const now = Date.now();
      const lastTime = lastNavigationRef.get(key) || 0;

      if (now - lastTime < NAVIGATION_DEBOUNCE_MS) {
        return false;
      }

      if (pendingNavigationRef.current === key) {
        return false;
      }

      pendingNavigationRef.current = key;
      lastNavigationRef.set(key, now);

      try {
        if (options?.replace) {
          router.replace(href as never);
        } else {
          router.push(href as never);
        }
        return true;
      } finally {
        setTimeout(() => {
          if (pendingNavigationRef.current === key) {
            pendingNavigationRef.current = null;
          }
        }, NAVIGATION_DEBOUNCE_MS);
      }
    },
    []
  );

  const push = useCallback(
    (href: string | object) => navigate(href, { replace: false }),
    [navigate]
  );

  const replace = useCallback(
    (href: string | object) => navigate(href, { replace: true }),
    [navigate]
  );

  return { push, replace, navigate };
}

export function useScreenGuard(screenName: string) {
  const isMountedRef = useRef(false);

  return useCallback(() => {
    if (isMountedRef.current) {
      return false;
    }
    isMountedRef.current = true;
    return true;
  }, [screenName]);
}