import { Hono } from "hono";
import { ApiError, body, clientIp, query, type ApiEnv } from "../middleware";
import { rateLimit } from "~/server/session";
import { storeBySlug, storeForHost } from "~/server/services/stores";
import * as sf from "~/server/services/storefront";
import { startPayment } from "~/server/payments";
import type { RawOrderInput } from "~/server/services/orders";
import type { Session, Store } from "~/lib/types";

/** Public fields only: no payment config beyond what checkout needs. */
function publicStore(s: Store) {
  return {
    id: s.id, name: s.name, slug: s.slug, tagline: s.tagline, description: s.description, logo_url: s.logo_url,
    theme_color: s.theme_color, banner_url: s.banner_url, font_style: s.font_style, announcement: s.announcement, phone: s.phone, email: s.email, address: s.address, whatsapp_number: s.whatsapp_number,
    facebook_page: s.facebook_page, instagram_handle: s.instagram_handle, tiktok_handle: s.tiktok_handle,
    delivery_fee_inside: s.delivery_fee_inside, delivery_fee_outside: s.delivery_fee_outside, free_delivery_over: s.free_delivery_over,
    cod_enabled: s.cod_enabled, esewa_id: s.esewa_id, khalti_id: s.khalti_id, esewa_online: s.esewa_online, khalti_online: s.khalti_online,
  };
}
export type PublicStore = ReturnType<typeof publicStore>;

const CLOSED = "closed";
const find = (slug: string, host: string | undefined) => (slug === "_host" ? storeForHost(host ?? null) : storeBySlug(slug));

/**
 * The store behind a storefront request. "_host" means look it up by the Host header (custom domains).
 * Without the Online store feature (or with a disabled owner) the shop is closed; unpublished shops are visible only
 * to their owner, as a preview.
 */
async function resolve(slug: string, host: string | undefined, session: Session | null): Promise<{ store: Store; preview: boolean }> {
  const store = await find(slug, host);
  if (!store) throw new ApiError(404, "Store not found");
  if (!store.storefront_enabled) throw new ApiError(404, CLOSED);
  if (store.published) return { store, preview: false };
  if (session?.stores.some((s) => String(s.id) === String(store.id))) return { store, preview: true };
  throw new ApiError(404, CLOSED);
}

export const storefront = new Hono<ApiEnv>()
  /** The store itself, or `closed` with just its name (so the page can say "not open yet"). */
  .get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    try {
      const { store, preview } = await resolve(slug, c.req.header("host"), c.get("session"));
      return c.json({ store: publicStore(store) as PublicStore | null, preview, closed: false, name: store.name });
    } catch (e) {
      if (!(e instanceof ApiError && e.message === CLOSED)) throw e;
      const s = await find(slug, c.req.header("host"));
      return c.json({ store: null as PublicStore | null, preview: false, closed: true, name: s?.name ?? "" });
    }
  })
  .get("/:slug/products", query<{ q?: string; c?: string }>(), async (c) => {
    const { store } = await resolve(c.req.param("slug"), c.req.header("host"), c.get("session"));
    return c.json(await sf.storeHome(store, c.req.valid("query")));
  })
  .get("/:slug/products/:product", async (c) => {
    const { store } = await resolve(c.req.param("slug"), c.req.header("host"), c.get("session"));
    const r = await sf.storeProduct(store, c.req.param("product"));
    if (!r) throw new ApiError(404, "Product not found");
    return c.json(r);
  })
  /** Current price and stock for the cart's items. `ids` is comma-separated. */
  .get("/:slug/cart", query<{ ids?: string }>(), async (c) => {
    const { store } = await resolve(c.req.param("slug"), c.req.header("host"), c.get("session"));
    return c.json(await sf.cartProducts(store, (c.req.valid("query").ids ?? "").split(",").filter(Boolean)));
  })
  .post("/:slug/orders", body<RawOrderInput>(), async (c) => {
    if (!rateLimit(`checkout:${clientIp(c)}`, 20, 60 * 60_000)) throw new ApiError(429, "Too many orders from this network. Please call the store.", "rate_limited");
    const { store } = await resolve(c.req.param("slug"), c.req.header("host"), c.get("session"));
    return c.json(await sf.placeOrder(store, c.req.valid("json")), 201);
  })
  .get("/:slug/orders/:token", async (c) => {
    const { store } = await resolve(c.req.param("slug"), c.req.header("host"), c.get("session"));
    const r = await sf.orderStatus(store, c.req.param("token"));
    if (!r) throw new ApiError(404, "Order not found");
    return c.json(r);
  })
  /** Start or retry an online payment. Returns a gateway URL (Khalti) or a signed form to post (eSewa). */
  .post("/:slug/orders/:token/payments", body<{ base?: string }>(), async (c) => {
    if (!rateLimit(`pay:${clientIp(c)}`, 30, 60 * 60_000)) throw new ApiError(429, "Too many payment attempts. Try again later.", "rate_limited");
    const { store } = await resolve(c.req.param("slug"), c.req.header("host"), c.get("session"));
    const host = c.req.header("host") ?? "localhost";
    const https = (process.env.PUBLIC_URL ?? "").startsWith("https:");
    const origin = `${https ? "https" : "http"}://${host}`;
    const requested = c.req.valid("json").base ?? "";
    const base = /^\/[\w/-]*$/.test(requested) ? requested : "";
    return c.json(await startPayment({ storeId: store.id, token: c.req.param("token"), origin, websiteUrl: `${origin}${base || "/"}` }));
  });
