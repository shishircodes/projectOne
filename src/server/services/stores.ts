import { sql } from "../db";
import { normalizeStore } from "../session";
import { normalizeFeatures } from "~/lib/features";
import type { Store } from "~/lib/types";

// Storefronts are read-heavy: cache store lookups briefly per instance.
const cache = new Map<string, { at: number; store: Store | null }>();
export const clearStoreCache = () => cache.clear();

async function cached(key: string, load: () => Promise<any>): Promise<Store | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.store;
  const row = await load();
  // The owner's access decides whether the shop is open and which payments it can take.
  const features = row ? normalizeFeatures(row.owner_features) : [];
  const store = row ? { ...normalizeStore(row, features), storefront_enabled: features.includes("storefront") && !row.owner_disabled } : null;
  if (store) for (const k of ["owner_features", "owner_disabled"]) delete (store as any)[k];
  cache.set(key, { at: Date.now(), store });
  return store;
}

const OWNER = () => sql.unsafe("s.*, u.features AS owner_features, u.disabled AS owner_disabled");
export const storeBySlug = (slug: string) =>
  cached(`slug:${slug}`, async () => (await sql`SELECT ${OWNER()} FROM stores s JOIN users u ON u.id = s.owner_id WHERE s.slug = ${slug}`)[0]);
export const storeByDomain = (host: string) =>
  cached(`domain:${host}`, async () => (await sql`SELECT ${OWNER()} FROM stores s JOIN users u ON u.id = s.owner_id WHERE s.custom_domain = ${host}`)[0]);

/** Store served on this Host: a custom domain or <slug>.BASE_DOMAIN. Null for the platform itself. */
export async function storeForHost(hostHeader: string | null): Promise<Store | null> {
  const host = (hostHeader ?? "").toLowerCase().replace(/:\d+$/, "");
  const base = (process.env.BASE_DOMAIN || "").toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1" || host === base || host === `www.${base}`) return null;
  if (base && host.endsWith("." + base)) {
    const slug = host.slice(0, -(base.length + 1));
    return slug && !slug.includes(".") ? storeBySlug(slug) : null;
  }
  return storeByDomain(host);
}
