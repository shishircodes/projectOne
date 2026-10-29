import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import { HttpError } from "~/server/errors";
import { lookupSession, requestToken } from "~/server/session";
import { FEATURES, type Feature } from "~/lib/features";
import type { Session, Store, StoreSession } from "~/lib/types";

/** What the host server passes in: the client IP (for rate limits), which the Request alone doesn't carry. */
export type Bindings = { ip?: string };

export type ApiEnv = {
  Bindings: Bindings;
  Variables: { session: Session | null; token: string | null; via: "bearer" | "cookie" | null };
};
type SignedInEnv = ApiEnv & { Variables: { session: Session; token: string } };
type StoreEnv = ApiEnv & { Variables: { session: StoreSession; token: string; store: Store; storeId: string } };

/**
 * Machine-readable reasons the web app and the mobile app act on (send to login, password page, onboarding…).
 * Every error response is `{ error: string, code?: ErrorCode }`.
 */
export type ErrorCode = "unauthenticated" | "password_change_required" | "no_store" | "feature_disabled" | "forbidden" | "rate_limited";

export class ApiError extends HttpError {
  constructor(status: number, message: string, public code?: ErrorCode) {
    super(status, message);
  }
}

// From the host server, not from headers a client could forge.
export const clientIp = (c: { env: Bindings | undefined }) => c.env?.ip ?? "?";

/** Runs on every request: who is calling, and how (cookie from the website, bearer token from the app). */
export const identify = createMiddleware<ApiEnv>(async (c, next) => {
  const { token, via } = requestToken(c.req.raw);
  c.set("token", token);
  c.set("via", via);
  c.set("session", token ? await lookupSession(token) : null);
  await next();
});

/**
 * Cookie-authenticated writes must come from our own pages. Browsers always send Origin on cross-site POSTs, and
 * JSON bodies can't be sent cross-site without a CORS preflight we never allow. Bearer requests can't be forged by
 * another site (it can't read the token), so they skip this.
 */
export const sameOrigin = createMiddleware<ApiEnv>(async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.get("via") !== "bearer") {
    const origin = c.req.header("origin");
    if (origin) {
      let host: string | null = null;
      try {
        host = new URL(origin).host;
      } catch {}
      if (host !== c.req.header("host")) throw new ApiError(403, "Cross-origin request blocked", "forbidden");
    }
  }
  await next();
});

/** Any signed-in user (onboarding, password change, creating a store). */
export const signedIn = createMiddleware<SignedInEnv>(async (c, next) => {
  if (!c.get("session")) throw new ApiError(401, "Please log in", "unauthenticated");
  await next();
});

/** Store dashboard: signed in, password set, and has a store open. */
export const storeOwner = createMiddleware<StoreEnv>(async (c, next) => {
  const s = c.get("session");
  if (!s) throw new ApiError(401, "Please log in", "unauthenticated");
  if (s.user.must_change_password) throw new ApiError(403, "Choose a new password first", "password_change_required");
  if (!s.store) throw new ApiError(409, "Create a store first", "no_store");
  c.set("store", s.store);
  c.set("storeId", s.store.id);
  await next();
});

/**
 * Store dashboard + feature gate: the user must have at least one of the listed features.
 * This is the real enforcement; hiding tabs in the UI is only a convenience.
 */
export const requires = (...anyOf: Feature[]) =>
  createMiddleware<StoreEnv>(async (c, next) => {
    if (!anyOf.some((f) => c.get("session").user.features.includes(f))) {
      const label = FEATURES.find((x) => x.key === anyOf[0])?.label ?? anyOf[0];
      throw new ApiError(403, `${label} isn't turned on for your account. Ask the NepalShop team to enable it.`, "feature_disabled");
    }
    await next();
  });

/** Platform admin console. */
export const adminOnly = createMiddleware<SignedInEnv>(async (c, next) => {
  const s = c.get("session");
  if (!s) throw new ApiError(401, "Please log in", "unauthenticated");
  if (!s.user.is_admin) throw new ApiError(403, "Admins only", "forbidden");
  await next();
});

/**
 * Typed request bodies and query strings. The services validate every field themselves (and turn bad input into
 * readable 400s), so these only declare the shape for the typed client; anything else in the body is ignored there.
 */
export const body = <T>() =>
  validator("json", (v) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw new ApiError(400, "Send a JSON object");
    return v as T;
  });
export const query = <T extends Record<string, string | undefined>>() => validator("query", (v) => v as unknown as T);
