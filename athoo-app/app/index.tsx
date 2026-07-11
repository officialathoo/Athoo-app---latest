import { router } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { AthooLoader } from "@/components/ui/AthooLoader";

export default function Index() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (user?.role === "customer") {
      router.replace("/(customer)/(tabs)/home");
      return;
    }

    if (user?.role === "provider") {
      router.replace("/(provider)/(tabs)/dashboard");
      return;
    }

    router.replace("/auth/welcome");
  }, [user, isLoading]);

  return <AthooLoader tagline="Pakistan's Home Services" />;
}
