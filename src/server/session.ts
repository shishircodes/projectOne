import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";
import { ESEWA_TEST_MERCHANT } from "./payments/esewa";
import type { Session, Store, StoreRef } from "~/lib/types";
import { normalizeFeatures, type Feature } from "~/lib/features";

// Sessions are rows in `sessions`, keyed by the SHA-256 of a random token. The same table serves both clients:
// - web: the token rides in an httpOnly cookie (30 days).
// - mobile: the app keeps the token in secure storage and sends `Authorization: Bearer <token>` (90 days, sliding).
// Every request looks the row up, so signing out, disabling an account or resetting a password takes effect at once.

export type ClientKind = "web" | "mobile";
export const SESSION_COOKIE = "ns_session";
export const WEB_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MOBILE_DAYS = 90;

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
export const secureCookies = () => (process.env.PUBLIC_URL ?? "").startsWith("https");

const STORE_NUMERIC = ["delivery_fee_inside", "delivery_fee_outside", "free_delivery_over"] as const;

/**
 * DB row -> public store shape. Gateway secrets never leave the server; only "is set" flags do.
 * Pass the owner's features so online payments switch off when the admin hasn't granted them.
 */
export function normalizeStore(row: any, ownerFeatures?: Feature[]): Store {
  const s = { ...row };
  for (const k of STORE_NUMERIC) s[k] = s[k] === null || s[k] === undefined ? null : Number(s[k]);
  const code = s.esewa_merchant_code;
  s.khalti_secret_set = !!s.khalti_secret_key;
  s.esewa_secret_set = !!s.esewa_secret_key;
  s.khalti_online = s.khalti_secret_set;
  s.esewa_online = !!code && (s.esewa_secret_set || (s.payment_mode === "test" && code === ESEWA_TEST_MERCHANT.code));
  if (ownerFeatures && !ownerFeatures.includes("online_payments")) s.khalti_online = s.esewa_online = false;
  delete s.khalti_secret_key;
  delete s.esewa_secret_key;
  delete s.owner_id;
  delete s.order_seq;
  return s as Store;
}

/** The signed-in user, their open store and all their stores; null for a missing, expired or revoked token. */
export async function lookupSession(token: string | null | undefined): Promise<Session | null> {
  if (!token) return null;
  const hash = sha256(token);
  const [u] = await sql`
    SELECT se.store_id AS open_store_id, se.client, se.last_used_at,
           u.id, u.name, u.email, u.is_admin, u.must_change_password, u.features, u.max_stores
    FROM sessions se
    JOIN users u ON u.id = se.user_id AND NOT u.disabled
    WHERE se.token_hash = ${hash} AND se.expires_at > now()`;
  if (!u) return null;
  // Record use at most hourly; mobile sessions slide forward so an app in regular use never logs out.
  if (Date.now() - new Date(u.last_used_at).getTime() > 3600_000) {
    sql`UPDATE sessions SET last_used_at = now(),
          expires_at = CASE WHEN client = 'mobile' THEN now() + make_interval(days => ${MOBILE_DAYS}) ELSE expires_at END
        WHERE token_hash = ${hash}`.catch(() => {});
  }
  const features = normalizeFeatures(u.features);
  const rows = await sql`SELECT * FROM stores WHERE owner_id = ${u.id} ORDER BY created_at`;
  // The open store: the one this session chose, else the first one.
  const open = rows.find((r: any) => String(r.id) === String(u.open_store_id)) ?? rows[0];
  return {
    user: { id: u.id, name: u.name, email: u.email, is_admin: u.is_admin, must_change_password: u.must_change_password, features, max_stores: u.max_stores },
    store: open ? normalizeStore(open, features) : null,
    stores: rows.map((r: any) => ({ id: r.id, name: r.name, slug: r.slug, published: r.published }) as StoreRef),
  };
}

/** Start a session and return its token. Mobile tokens carry a prefix so leaked ones are easy to spot. */
export async function createSession(userId: string, { client = "web", device }: { client?: ClientKind; device?: string | null } = {}) {
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${userId}`;
  const token = (client === "mobile" ? "nsm_" : "") + randomBytes(32).toString("base64url");
  const days = client === "mobile" ? MOBILE_DAYS : 30;
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at, client, device_name)
            VALUES (${sha256(token)}, ${userId}, now() + make_interval(days => ${days}), ${client}, ${device?.slice(0, 100) ?? null})`;
  return token;
}

export async function deleteSession(token: string | null | undefined) {
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
}

/** Switch which of the user's stores this session works on. */
export async function openStore(token: string, userId: string, storeId: string) {
  const [own] = await sql`SELECT 1 FROM stores WHERE id = ${storeId} AND owner_id = ${userId}`;
  if (!own) throw new Error("Store not found");
  await sql`UPDATE sessions SET store_id = ${storeId} WHERE token_hash = ${sha256(token)}`;
}

/** Session token from a request: a bearer token (mobile) wins over the cookie (web). */
export function requestToken(req: Request): { token: string | null; via: "bearer" | "cookie" | null } {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return { token: auth.slice(7).trim() || null, via: "bearer" };
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return { token: part.slice(i + 1).trim(), via: "cookie" };
  }
  return { token: null, via: null };
}

export const getSessionFromRequest = (req: Request) => lookupSession(requestToken(req).token);

// Naive per-key limiter (login, signup, checkout); per instance, in memory.
const attempts = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max = 10, windowMs = 10 * 60_000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  return ++a.n <= max;
}

/** Sign out every session of a user (password reset, account disabled). */
export async function endAllSessions(userId: string) {
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}
