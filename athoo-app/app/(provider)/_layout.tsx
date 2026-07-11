import { Stack, router, usePathname } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { AthooLoader } from "@/components/ui/AthooLoader";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Colors } from "@/constants/colors";
import { Icon } from "@/components/ui/Icon";

// ── Verification wall ─────────────────────────────────────────────────────────
// Shown to providers whose account is not yet approved. They can still view
// their profile and logout, but cannot access jobs, broadcast, or earnings.
function VerificationWall({ status, note }: { status: string; note?: string | null }) {
  const { logout, refreshUser } = useAuth();
  const isRejected = status === "rejected";
  return (
    <View style={vw.container}>
      <View style={vw.card}>
        <Icon
          name={isRejected ? "shield-x" : "shield-check"}
          size={52}
          color={isRejected ? Colors.error : Colors.warning}
        />
        <Text style={vw.title}>
          {isRejected ? "Verification Rejected" : "Verification Pending"}
        </Text>
        <Text style={vw.body}>
          {isRejected
            ? (note || "Your provider application needs corrected documents. Review the reason and resubmit without creating another account.")
            : "Your documents are under review. We'll notify you once your account is approved — usually within 24 hours."}
        </Text>
        <Pressable style={vw.primaryBtn} onPress={() => router.push("/(provider)/verification-documents" as any)}>
          <Text style={vw.primaryBtnText}>{isRejected ? "Fix Documents" : "View Documents"}</Text>
        </Pressable>
        <Pressable style={vw.btn} onPress={() => refreshUser().catch(() => {})}>
          <Text style={vw.btnText}>Refresh Status</Text>
        </Pressable>
        <Pressable style={vw.linkBtn} onPress={logout}>
          <Text style={vw.linkText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const vw = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: Colors.surface, borderRadius: 20, padding: 32, alignItems: "center", gap: 16, maxWidth: 360, width: "100%", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  title: { fontSize: 20, fontWeight: "600", color: Colors.text, textAlign: "center" },
  body: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  primaryBtn: { marginTop: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  btn: { backgroundColor: Colors.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  btnText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 18 },
  linkText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
});

export default function ProviderLayout() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/auth/welcome" as any);
    }
  }, [user, isLoading]);

  if (isLoading) return <AthooLoader />;
  if (!user) return null;

  // Block access until admin approves the provider account.
  // "approved" is set by admin via the verification panel.
  const vs = user.verificationStatus as string | undefined;
  const isApproved = user.isVerified || vs === "approved";
  if (!isApproved) {
    if (pathname.includes("verification-documents")) {
      return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="verification-documents" /></Stack>;
    }
    return <VerificationWall status={vs || "pending"} note={user.verificationNote} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="job-detail" />
      <Stack.Screen name="chat-room" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="invoices" />
      <Stack.Screen name="chatbot" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="help" />
      <Stack.Screen name="contact-support" />
      <Stack.Screen name="about" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="negotiations" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="broadcast-jobs" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="pay-commission" />
      <Stack.Screen name="withdrawal-requests" />
      <Stack.Screen name="availability" />
      <Stack.Screen name="subscription" />
      <Stack.Screen name="service-radius" />
      <Stack.Screen name="support-tickets" />
    </Stack>
  );
}

