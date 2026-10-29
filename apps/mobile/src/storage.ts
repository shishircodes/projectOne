import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// The bearer token lives in the OS keychain / keystore (expo-secure-store).
// The web preview has no secure store, so it falls back to localStorage there (development only).
const web = Platform.OS === "web";

export const storage = {
  async get(key: string): Promise<string | null> {
    if (web) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null): Promise<void> {
    if (web) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {}
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};

export const KEYS = { token: "nepalshop.token", server: "nepalshop.server" } as const;
