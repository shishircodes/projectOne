import { randomInt } from "node:crypto";
import { sql } from "../db";
import { bool, HttpError, id, int, likeEscape, str } from "../errors";
import { ALL_FEATURES, normalizeFeatures, type Feature } from "~/lib/features";
import { endAllSessions } from "../session";
import { createStore, validEmail } from "./account";
import { clearStoreCache } from "./stores";

// Unambiguous characters only (no 0/O, 1/l/I) so a password read over the phone survives.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function temporaryPassword() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

export type AccountStore = { id: string; name: string; slug: string; published: boolean; products: number; orders: number; last_order_at: string | null };

export type Account = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  disabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  features: Feature[];
  max_stores: number;
  stores: AccountStore[];
};

export async function listAccounts(q?: string | null) {
  const pattern = q?.trim() ? `%${likeEscape(q.trim())}%` : null;
  const [accounts, [totals]] = await Promise.all([
    sql`
      SELECT u.id, u.name, u.email, u.is_admin, u.disabled, u.must_change_password, u.last_login_at, u.created_at, u.features, u.max_stores,
             coalesce((
               SELECT json_agg(json_build_object(
                        'id', s.id::text, 'name', s.name, 'slug', s.slug, 'published', s.published,
                        'products', (SELECT count(*) FROM products p WHERE p.store_id = s.id),
                        'orders', (SELECT count(*) FROM orders o WHERE o.store_id = s.id),
                        'last_order_at', (SELECT max(created_at) FROM orders o WHERE o.store_id = s.id)
                      ) ORDER BY s.created_at)
               FROM stores s WHERE s.owner_id = u.id), '[]'::json) AS stores
      FROM users u
      WHERE (${pattern}::text IS NULL OR u.name ILIKE ${pattern} OR u.email ILIKE ${pattern}
             OR EXISTS (SELECT 1 FROM stores s WHERE s.owner_id = u.id AND s.name ILIKE ${pattern}))
      ORDER BY u.created_at DESC
      LIMIT 500`,
    sql`
      SELECT (SELECT count(*)::int FROM users) AS users,
             (SELECT count(*)::int FROM stores) AS stores,
             (SELECT count(*)::int FROM stores WHERE published) AS published,
             (SELECT count(*)::int FROM users WHERE must_change_password AND NOT disabled) AS pending`,
  ]);
  return {
    accounts: accounts.map((a: any) => ({ ...a, features: normalizeFeatures(a.features) })) as Account[],
    totals: totals as { users: number; stores: number; published: number; pending: number },
  };
}

const validMaxStores = (v: unknown) => int(v, "Store limit", { min: 0, max: 100 }) ?? 1;

/** Admin creates an account with its features and store limit (optionally with a first store). Returns a one-time password. */
export async function createAccount(
  adminId: string,
  input: { name: string; email: string; storeName?: string; makeAdmin?: boolean; features?: string[]; maxStores?: number | string },
) {
  const name = str(input.name, "Name", { required: true, max: 100 })!;
  const email = validEmail(input.email);
  const features = normalizeFeatures(input.features ?? ALL_FEATURES);
  const maxStores = validMaxStores(input.maxStores);
  const [exists] = await sql`SELECT 1 FROM users WHERE email = ${email}`;
  if (exists) throw new HttpError(409, "An account with this email already exists");
  const password = temporaryPassword();
  const [u] = await sql`
    INSERT INTO users (email, name, password_hash, is_admin, must_change_password, created_by, features, max_stores)
    VALUES (${email}, ${name}, ${await Bun.password.hash(password)}, ${bool(input.makeAdmin, false)}, true, ${adminId}, ${features}::jsonb, ${maxStores})
    RETURNING id`;
  let store: { id: string; slug: string } | null = null;
  if (str(input.storeName, "Store name", { max: 100 })) store = await createStore(u.id, input.storeName);
  return { userId: u.id as string, email, password, store };
}

/** Change what a user can use and how many stores they may own. Takes effect on their next request. */
export async function setAccess(userId: string, input: { features: string[]; maxStores: number | string }) {
  const uid = id(userId, "user");
  const features = normalizeFeatures(input.features);
  const maxStores = validMaxStores(input.maxStores);
  const [u] = await sql`
    UPDATE users SET features = ${features}::jsonb, max_stores = ${maxStores} WHERE id = ${uid}
    RETURNING (SELECT count(*)::int FROM stores WHERE owner_id = ${uid}) AS owned`;
  if (!u) throw new HttpError(404, "User not found");
  clearStoreCache(); // storefront access depends on the owner's features
  return { features, maxStores, owned: u.owned as number };
}

export async function createStoreFor(userId: string, storeName: string) {
  return createStore(id(userId, "user"), storeName);
}

/** New one-time password; signs the user out everywhere. */
export async function resetPassword(userId: string) {
  const uid = id(userId, "user");
  const password = temporaryPassword();
  const [u] = await sql`UPDATE users SET password_hash = ${await Bun.password.hash(password)}, must_change_password = true WHERE id = ${uid} RETURNING email`;
  if (!u) throw new HttpError(404, "User not found");
  await endAllSessions(uid);
  return { email: u.email as string, password };
}

export async function setDisabled(adminId: string, userId: string, disabled: boolean) {
  const uid = id(userId, "user");
  if (uid === String(adminId)) throw new HttpError(400, "You can't disable your own account");
  const [u] = await sql`UPDATE users SET disabled = ${disabled} WHERE id = ${uid} RETURNING id`;
  if (!u) throw new HttpError(404, "User not found");
  if (disabled) await endAllSessions(uid);
  clearStoreCache();
}

export async function setAdmin(adminId: string, userId: string, isAdmin: boolean) {
  const uid = id(userId, "user");
  if (uid === String(adminId) && !isAdmin) throw new HttpError(400, "You can't remove your own admin access");
  const [u] = await sql`UPDATE users SET is_admin = ${isAdmin} WHERE id = ${uid} RETURNING id`;
  if (!u) throw new HttpError(404, "User not found");
}
