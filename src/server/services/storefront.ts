import { sql } from "../db";
import { bad, likeEscape } from "../errors";
import { verifyOrderPayments } from "../payments";
import { normalizeProduct } from "./catalog";
import { createOrder, parseOrderInput, type RawOrderInput } from "./orders";
import type { Product, Store } from "~/lib/types";

export type PublicProduct = Omit<Product, "cost_price">;
const strip = ({ cost_price, ...p }: Product): PublicProduct => p;

export async function storeHome(store: Store, f: { q?: string; c?: string }) {
  const q = f.q?.trim() || null;
  const cat = f.c || null;
  const pattern = q ? `%${likeEscape(q)}%` : null;
  const [categories, products] = await Promise.all([
    // Categories with something to sell, plus a cover photo (newest product with one) for the home page tiles.
    sql`SELECT c.name, c.slug, count(*)::int AS count,
               (array_agg(p.images->>0 ORDER BY p.created_at DESC) FILTER (WHERE jsonb_array_length(p.images) > 0))[1] AS image
        FROM categories c JOIN products p ON p.category_id = c.id AND p.status = 'active'
        WHERE c.store_id = ${store.id}
        GROUP BY c.id ORDER BY c.sort, c.name`,
    sql`SELECT p.* FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.store_id = ${store.id} AND p.status = 'active'
          AND (${cat}::text IS NULL OR c.slug = ${cat})
          AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern})
        ORDER BY (p.track_stock AND p.stock <= 0), p.created_at DESC LIMIT 120`,
  ]);
  return {
    categories: categories as { name: string; slug: string; count: number; image: string | null }[],
    products: products.map((p: any) => strip(normalizeProduct(p))),
  };
}

export async function storeProduct(store: Store, slug: string) {
  const [row] = await sql`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.store_id = ${store.id} AND p.slug = ${slug} AND p.status = 'active'`;
  if (!row) return null;
  const product = strip(normalizeProduct(row)) as PublicProduct & { category_slug: string | null };
  const related = await sql`
    SELECT * FROM products WHERE store_id = ${store.id} AND status = 'active' AND id <> ${row.id}
      AND (category_id IS NOT DISTINCT FROM ${row.category_id}) ORDER BY created_at DESC LIMIT 4`;
  return { product, related: related.map((p: any) => strip(normalizeProduct(p))) };
}

export async function cartProducts(store: Store, ids: string[]): Promise<PublicProduct[]> {
  const clean = ids.filter((s) => /^\d{1,18}$/.test(s)).slice(0, 100);
  if (!clean.length) return [];
  const rows = await sql`SELECT * FROM products WHERE store_id = ${store.id} AND status = 'active' AND id IN ${sql(clean)}`;
  return rows.map((p: any) => strip(normalizeProduct(p)));
}

/** Storefront checkout. Online wallet orders return `pay: true` so the client starts the gateway. */
export async function placeOrder(store: Store, raw: RawOrderInput) {
  const input = parseOrderInput(raw, { manual: false });
  const m = input.payment_method;
  if (m === "esewa" || m === "khalti") {
    if (!store[`${m}_online`] && !store[`${m}_id`]) throw bad("That payment method is not available");
  } else if (m !== "cod") throw bad("That payment method is not available");
  const order = await createOrder(store, input, { onlyActive: true });
  return {
    order_number: order.order_number,
    total: order.total,
    token: order.public_token,
    pay: (m === "esewa" || m === "khalti") && !!store[`${m}_online`],
  };
}

export async function orderStatus(store: Store, token: string) {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const load = () => sql`
    SELECT id, order_number, status, payment_method, payment_status, payment_ref, customer_name, province, city, address,
           subtotal::float8 AS subtotal, delivery_fee::float8 AS delivery_fee, discount::float8 AS discount, total::float8 AS total, created_at
    FROM orders WHERE store_id = ${store.id} AND public_token = ${token}`;
  let [o] = await load();
  if (!o) return null;
  const online = (o.payment_method === "esewa" || o.payment_method === "khalti") && store[`${o.payment_method as "esewa" | "khalti"}_online`];

  // The customer came back later (or closed the gateway tab): re-check open attempts, at most every 20s.
  if (online && o.payment_status === "unpaid") {
    const stale = await sql`SELECT 1 FROM payments WHERE order_id = ${o.id} AND status IN ('initiated','pending')
                            AND coalesce(checked_at, created_at) < now() - interval '20 seconds' LIMIT 1`;
    if (stale.length) {
      await verifyOrderPayments(o.id);
      [o] = await load();
    }
  }
  const [items, [last]] = await Promise.all([
    sql`SELECT name, price::float8 AS price, quantity FROM order_items WHERE order_id = ${o.id} ORDER BY id`,
    sql`SELECT status FROM payments WHERE order_id = ${o.id} ORDER BY created_at DESC LIMIT 1`,
  ]);
  const { id: _id, ...order } = o;
  return {
    order: order as {
      order_number: number; status: string; payment_method: string; payment_status: string; payment_ref: string | null;
      customer_name: string; province: string | null; city: string | null; address: string | null;
      subtotal: number; delivery_fee: number; discount: number; total: number; created_at: string;
    },
    items: items as { name: string; price: number; quantity: number }[],
    online: !!online,
    lastAttempt: (last?.status ?? null) as string | null,
  };
}
