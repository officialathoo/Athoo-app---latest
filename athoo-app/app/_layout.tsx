import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, usePathname, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { AthooLoader } from "@/components/ui/AthooLoader";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ResponsiveViewport } from "@/components/ResponsiveViewport";
import { OfflineBanner } from "@/components/ui/UiState";
import { LegalConsentGate } from "@/components/ui/LegalConsentGate";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BookingProvider } from "@/context/BookingContext";
import { BroadcastProvider } from "@/context/BroadcastContext";
import { CallProvider } from "@/context/CallContext";
import { CategoriesProvider } from "@/context/CategoriesContext";
import { ChatProvider } from "@/context/ChatContext";
import { LanguageProvider, useLang } from "@/context/LanguageContext";
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
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: "online",
      retry: 0,
    },
  },
});


function SessionRouteGuard() {
  const { user, isLoading, requiresBiometric } = useAuth();
  const pathname = usePathname();
  const segments = useSegments();
  const pendingDestinationRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const publicPath =
      pathname.startsWith("/auth") ||
      pathname.startsWith("/legal") ||
      pathname.startsWith("/appearance") ||
      pathname.startsWith("/language");

    let destination: string | null = null;
    if (requiresBiometric) {
      if (pathname !== "/auth/welcome") destination = "/auth/welcome";
    } else if (!user) {
      if (!publicPath) destination = "/auth/welcome";
    } else {
      const home = user.role === "provider"
        ? "/(provider)/(tabs)/dashboard"
        : "/(customer)/(tabs)/home";
      const rootSegment = String(segments[0] || "");
      const wrongRolePath = user.role === "provider"
        ? rootSegment === "(customer)"
        : rootSegment === "(provider)";
      if (pathname === "/" || pathname.startsWith("/auth") || wrongRolePath) {
        destination = home;
      }
    }

    if (!destination || destination === pathname) {
      pendingDestinationRef.current = null;
      return;
    }
    if (pendingDestinationRef.current === destination) return;
    pendingDestinationRef.current = destination;
    router.replace(destination as never);
  }, [isLoading, pathname, requiresBiometric, segments, user]);

  useEffect(() => {
    pendingDestinationRef.current = null;
  }, [pathname]);

  return null;
}

function RootLayoutNav() {
  const { theme } = useTheme();
  return (
    <>
      <SessionRouteGuard />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="language" />
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
  const { translate: tr } = useLang();
  return (
    <View style={[configurationStyles.container, { backgroundColor: theme.colors.background }]}>
      <AppCard style={configurationStyles.card}>
        <AppText variant="h2" align="center">{tr("Service temporarily unavailable")}</AppText>
        <AppText tone="secondary" align="center" style={{ marginTop: theme.spacing.md }}>
          {tr("Athoo cannot connect right now. Please install the latest app version or contact Athoo Support.")}
        </AppText>
      </AppCard>
    </View>
  );
}

const configurationStyles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 480 },
});

function ConfiguredApplication() {
  const { theme } = useTheme();
  const { ready: languageReady } = useLang();

  if (!languageReady) {
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
                                <ResponsiveViewport>
                                  <RootLayoutNav />
                                </ResponsiveViewport>
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
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </>
  );
}

function ThemedApplication() {
  const { ready } = useTheme();

  if (!ready) {
    return <AthooLoader />;
  }

  return (
    <LanguageProvider>
      <ConfiguredApplication />
    </LanguageProvider>
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
