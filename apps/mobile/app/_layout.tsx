import { useEffect } from "react";
import { AppState, Platform, useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api";
import { SessionProvider, useSession } from "@/session";
import { palette } from "@/theme/palette";
import { Button, Center, Loading, Text } from "@/ui";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Don't retry "you can't do that" answers; do retry flaky connections once.
      retry: (n, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && n < 1,
    },
  },
});

// Refetch when the app comes back to the foreground (React Query's "window focus" on phones).
function useAppFocus() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useAppFocus();
  const scheme = useColorScheme();
  const c = scheme === "dark" ? palette.dark : palette.light;
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.brand, background: c.bg, card: c.surface, text: c.text, border: c.border, notification: c.brand },
  };
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <SessionProvider>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Gate />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * Which screens the seller can reach right now. The API's error codes map onto these:
 * unauthenticated → login, password_change_required → change-password, no_store → no-store.
 */
function Gate() {
  const { status, session, error, refresh, signOut } = useSession();

  if (status === "loading") return <Loading />;
  if (status === "offline")
    return (
      <Center>
        <Text variant="heading">Can't reach NepalShop</Text>
        <Text muted style={{ textAlign: "center" }}>
          {error}
        </Text>
        <Button title="Try again" onPress={refresh} style={{ alignSelf: "stretch" }} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </Center>
    );

  const signedIn = status === "signedIn" && !!session;
  const mustChange = signedIn && session.user.must_change_password;
  const noStore = signedIn && !mustChange && !session.store;
  const ready = signedIn && !mustChange && !noStore;

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={mustChange}>
        <Stack.Screen name="change-password" options={{ title: "Choose a password", headerBackVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={noStore}>
        <Stack.Screen name="no-store" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ title: "Order" }} />
        <Stack.Screen name="chat/[id]" options={{ title: "Chat" }} />
        <Stack.Screen name="product/[id]" options={{ title: "Product" }} />
        <Stack.Screen name="stores" options={{ title: "Switch store", presentation: "modal" }} />
      </Stack.Protected>
    </Stack>
  );
}
