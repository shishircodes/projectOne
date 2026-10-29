import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Device from "expo-device";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, call, defaultServer, getServer, setRoutingErrorHandler, setServer, setToken, type Data } from "./api";
import { KEYS, storage } from "./storage";

export type SessionInfo = NonNullable<Data<typeof api.auth.session.$get>>;
export type Feature = SessionInfo["user"]["features"][number];

/**
 * - loading: reading the saved token / asking the server who we are
 * - offline: there's a saved token but the server can't be reached (keep the token, offer Retry)
 * - signedOut: no token, or the server says it's no longer valid
 * - signedIn: see `session` for what the seller can do (password change, no store, features)
 */
type Status = "loading" | "offline" | "signedOut" | "signedIn";

type Ctx = {
  status: Status;
  session: SessionInfo | null;
  error: string | null;
  server: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
  changeServer: (url: string) => Promise<void>;
  has: (f: Feature) => boolean;
};

const SessionContext = createContext<Ctx | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** The open store's session; only use on screens behind the signed-in guard. */
export function useStoreSession() {
  const ctx = useSession();
  if (!ctx.session?.store) throw new Error("No store open");
  return { ...ctx, session: ctx.session as SessionInfo & { store: NonNullable<SessionInfo["store"]> } };
}

const deviceName = () => [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || Device.deviceName || "Phone";

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServerState] = useState(getServer());
  const refreshing = useRef<Promise<void> | null>(null);

  const forget = useCallback(async () => {
    setToken(null);
    await storage.set(KEYS.token, null);
    setSession(null);
    setStatus("signedOut");
    qc.clear();
  }, [qc]);

  // Ask the server who we are. auth/session never 401s: null means the token is gone (expired, revoked, signed out).
  const refresh = useCallback(() => {
    refreshing.current ??= (async () => {
      try {
        const s = await call(api.auth.session.$get());
        if (!s) return forget();
        setSession(s);
        setError(null);
        setStatus("signedIn");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : String(e));
        setStatus("offline");
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [forget]);

  // First launch: restore the server choice and token from the device.
  useEffect(() => {
    (async () => {
      const [savedServer, token] = await Promise.all([storage.get(KEYS.server), storage.get(KEYS.token)]);
      if (savedServer) {
        setServer(savedServer);
        setServerState(getServer());
      }
      if (!token) return setStatus("signedOut");
      setToken(token);
      await refresh();
    })();
  }, [refresh]);

  // Any request that comes back with a routing code: signed out, or the session changed under us (password reset,
  // store removed). Re-read the session and the root layout sends the seller to the right screen.
  useEffect(() => {
    setRoutingErrorHandler((code) => {
      if (code === "unauthenticated") void forget();
      else void refresh();
    });
    return () => setRoutingErrorHandler(null);
  }, [forget, refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await call(api.auth.login.$post({ json: { email: email.trim(), password, client: "mobile", device_name: deviceName() } }));
    if (!res.token || !res.session) throw new ApiError(500, "The server didn't return a mobile session. Is it up to date?");
    setToken(res.token);
    await storage.set(KEYS.token, res.token);
    qc.clear();
    setSession(res.session);
    setError(null);
    setStatus("signedIn");
  }, [qc]);

  const signOut = useCallback(async () => {
    try {
      await call(api.auth.logout.$post()); // ends this phone's session only
    } catch {}
    await forget();
  }, [forget]);

  const switchStore = useCallback(async (storeId: string) => {
    await call(api.stores[":id"].open.$post({ param: { id: storeId } }));
    qc.removeQueries(); // everything cached belongs to the previous store
    await refresh();
  }, [qc, refresh]);

  const changeServer = useCallback(async (url: string) => {
    setServer(url || defaultServer());
    setServerState(getServer());
    await storage.set(KEYS.server, url ? getServer() : null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      status,
      session,
      error,
      server,
      signIn,
      signOut,
      refresh,
      switchStore,
      changeServer,
      has: (f) => !!session?.user.features.includes(f),
    }),
    [status, session, error, server, signIn, signOut, refresh, switchStore, changeServer],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
