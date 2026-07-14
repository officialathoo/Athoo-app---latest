import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { AthooLoader } from "@/components/ui/AthooLoader";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/ui/UiState";
import { LegalConsentGate } from "@/components/ui/LegalConsentGate";
import { AuthProvider } from "@/context/AuthContext";
import { BookingProvider } from "@/context/BookingContext";
import { BroadcastProvider } from "@/context/BroadcastContext";
import { CallProvider } from "@/context/CallContext";
import { CategoriesProvider } from "@/context/CategoriesContext";
import { ChatProvider } from "@/context/ChatContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { NegotiationProvider } from "@/context/NegotiationContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ToastProvider } from "@/context/ToastContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AppCard, AppText } from "@/components/design";
import { api } from "@/services/api";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function RootLayoutNav() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="legal" />
        <Stack.Screen name="call" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <OfflineBanner />
      <LegalConsentGate />
    </>
  );
}

function ApiConfigurationScreen() {
  const { theme } = useTheme();
  return (
    <View style={[configurationStyles.container, { backgroundColor: theme.colors.background }]}>
      <AppCard style={configurationStyles.card}>
        <AppText variant="h2" align="center">Athoo is not configured</AppText>
        <AppText tone="secondary" align="center" style={{ marginTop: theme.spacing.md }}>
          Set EXPO_PUBLIC_API_BASE_URL to the Athoo API address, then rebuild the mobile app.
        </AppText>
      </AppCard>
    </View>
  );
}

const configurationStyles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 480 },
});

function ThemedApplication() {
  const { theme, ready } = useTheme();

  if (!ready) {
    return <AthooLoader />;
  }

  return !api.isConfigured ? (
    <ApiConfigurationScreen />
  ) : (
    <>
      <StatusBar
        style={theme.dark ? "light" : "dark"}
        translucent={false}
        backgroundColor={theme.colors.background}
      />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <LanguageProvider>
              <SettingsProvider>
                <ToastProvider>
                  <AuthProvider>
                    <CategoriesProvider>
                      <NotificationProvider>
                        <BroadcastProvider>
                          <BookingProvider>
                            <ChatProvider>
                              <NegotiationProvider>
                                <CallProvider>
                                  <RootLayoutNav />
                                </CallProvider>
                              </NegotiationProvider>
                            </ChatProvider>
                          </BookingProvider>
                        </BroadcastProvider>
                      </NotificationProvider>
                    </CategoriesProvider>
                  </AuthProvider>
                </ToastProvider>
              </SettingsProvider>
            </LanguageProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <AthooLoader />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApplication />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
