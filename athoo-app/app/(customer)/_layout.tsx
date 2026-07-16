import { Stack } from "expo-router";
import React from "react";
import { useAuth } from "@/context/AuthContext";
import { AthooLoader } from "@/components/ui/AthooLoader";

export default function CustomerLayout() {
  const { user, isLoading } = useAuth();



  if (isLoading) return <AthooLoader />;
  if (!user || user.role !== "customer") return <AthooLoader />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="service-providers" />
      <Stack.Screen name="provider-detail" />
      <Stack.Screen name="map" />
      <Stack.Screen name="book-service" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="chat-room" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="negotiate" />
      <Stack.Screen name="billing" />
      <Stack.Screen name="invoices" />
      <Stack.Screen name="chatbot" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="saved" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="help" />
      <Stack.Screen name="contact-support" />
      <Stack.Screen name="about" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="broadcast-status" />
      <Stack.Screen name="support-tickets" />
      <Stack.Screen name="refund-requests" />
      <Stack.Screen name="subscription" />
    </Stack>
  );
}

