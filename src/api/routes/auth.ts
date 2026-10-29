import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { ApiError, body, clientIp, signedIn, type ApiEnv } from "../middleware";
import { createSession, deleteSession, openStore, rateLimit, secureCookies, SESSION_COOKIE, WEB_MAX_AGE, lookupSession, type ClientKind } from "~/server/session";
import { changePassword, createStore, publicSignupEnabled, signup, verifyLogin } from "~/server/services/account";
import type { Session } from "~/lib/types";

/** Where to send someone right after they sign in. */
export type LoginDestination = "/account/password" | "/onboarding" | "/admin" | "/app";
export type SessionInfo = (Session & { baseDomain: string | null }) | null;

const destination = (s: { mustChange: boolean; hasStore: boolean; isAdmin: boolean }): LoginDestination =>
  s.mustChange ? "/account/password" : s.hasStore ? "/app" : s.isAdmin ? "/admin" : "/onboarding";

const withDomain = (s: Session | null): SessionInfo => (s ? { ...s, baseDomain: process.env.BASE_DOMAIN || null } : null);

export const auth = new Hono<ApiEnv>()
  /** Public config for the sign-in pages. */
  .get("/config", (c) => c.json({ publicSignup: publicSignupEnabled(), contactEmail: process.env.CONTACT_EMAIL || null }))

  /** The current session, or null. Never 401s, so pages can ask "am I signed in?". */
  .get("/session", (c) => c.json(withDomain(c.get("session"))))

  /**
   * Sign in. The website gets an httpOnly cookie. The mobile app sends `client: "mobile"` and gets a bearer
   * token in the body instead, to keep in the device's secure storage.
   */
  .post("/login", body<{ email: string; password: string; client?: ClientKind; device_name?: string }>(), async (c) => {
    const d = c.req.valid("json");
    if (!rateLimit(`login:${clientIp(c)}`, 10)) throw new ApiError(429, "Too many attempts. Try again in a few minutes.", "rate_limited");
    const u = await verifyLogin(d);
    if (!u) throw new ApiError(401, "That email and password don't match");
    if (u.disabled) throw new ApiError(403, "This account is disabled. Contact the NepalShop team.", "forbidden");
    const to = destination(u);
    if (d.client === "mobile") {
      const token = await createSession(u.id, { client: "mobile", device: d.device_name });
      return c.json({ to, token: token as string | undefined, session: withDomain(await lookupSession(token)) });
    }
    const token = await createSession(u.id);
    setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: secureCookies(), maxAge: WEB_MAX_AGE });
    return c.json({ to, token: undefined as string | undefined, session: undefined as SessionInfo | undefined });
  })

  /** Self-serve sign-up, only while PUBLIC_SIGNUP is on (the trial is invite-only). Web only. */
  .post("/signup", body<{ name: string; email: string; storeName: string; password: string }>(), async (c) => {
    if (!rateLimit(`signup:${clientIp(c)}`, 5)) throw new ApiError(429, "Too many attempts. Try again in a few minutes.", "rate_limited");
    const token = await createSession(await signup(c.req.valid("json")));
    setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: secureCookies(), maxAge: WEB_MAX_AGE });
    return c.json({ to: "/app" as LoginDestination });
  })

  /** Ends this session only (this browser or this phone). */
  .post("/logout", async (c) => {
    await deleteSession(c.get("token"));
    if (c.get("via") === "cookie") deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  })

  .post("/password", signedIn, body<{ current?: string; next: string }>(), async (c) => {
    const s = c.get("session");
    await changePassword(s.user.id, c.req.valid("json"));
    return c.json({ to: destination({ mustChange: false, hasStore: !!s.store, isAdmin: s.user.is_admin }) });
  });

/** The signed-in user's stores: create one (within the admin's limit) or switch the open one. */
export const stores = new Hono<ApiEnv>()
  .post("/", signedIn, body<{ name: string }>(), async (c) => {
    const s = c.get("session");
    const store = await createStore(s.user.id, c.req.valid("json").name);
    await openStore(c.get("token"), s.user.id, store.id);
    return c.json(store, 201);
  })
  .post("/:id/open", signedIn, async (c) => {
    try {
      await openStore(c.get("token"), c.get("session").user.id, c.req.param("id"));
    } catch {
      throw new ApiError(404, "Store not found");
    }
    return c.json({ ok: true });
  });
