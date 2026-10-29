import { sql } from "../db";
import { likeEscape } from "../errors";
import type { Feature } from "~/lib/features";

/** Command-palette search across products, orders and conversations — only the ones this user has access to. */
export async function searchEverything(storeId: string, raw: string, features: Feature[]) {
  const can = (f: Feature) => features.includes(f);
  const q = raw.trim().slice(0, 100);
  if (!q) return { products: [], orders: [], conversations: [] };
  const pattern = `%${likeEscape(q)}%`;
  const digits = q.replace(/[^\d]/g, "");
  const none = Promise.resolve([] as any[]);
  const [products, orders, conversations] = await Promise.all([
    !can("products") ? none : sql`SELECT id, name, sku, stock, track_stock, images FROM products
        WHERE store_id = ${storeId} AND (name ILIKE ${pattern} OR sku ILIKE ${pattern}) ORDER BY updated_at DESC LIMIT 6`,
    !can("orders") ? none : sql`SELECT id, order_number, customer_name, customer_phone, status, total::float8 AS total FROM orders
        WHERE store_id = ${storeId} AND (customer_name ILIKE ${pattern} OR order_number::text = ${digits || "-"}
              OR (${digits.length >= 4} AND customer_phone LIKE ${"%" + digits + "%"}))
        ORDER BY created_at DESC LIMIT 6`,
    !can("inbox") ? none : sql`SELECT id, channel, customer_name, last_message FROM conversations
        WHERE store_id = ${storeId} AND (customer_name ILIKE ${pattern} OR last_message ILIKE ${pattern})
        ORDER BY last_message_at DESC LIMIT 5`,
  ]);
  return {
    products: products as { id: string; name: string; sku: string | null; stock: number; track_stock: boolean; images: string[] }[],
    orders: orders as { id: string; order_number: number; customer_name: string; customer_phone: string; status: string; total: number }[],
    conversations: conversations as { id: string; channel: string; customer_name: string | null; last_message: string | null }[],
  };
}
