import { sql } from "../db";
import { bad, bool, id, int, likeEscape, notFound, num, oneOf, slugify, str } from "../errors";
import { PRODUCT_STATUSES, type Category, type Page, type Product, type StockMovement } from "~/lib/types";

// ---- helpers -------------------------------------------------------------------

async function uniqueSlug(table: "products" | "categories", storeId: string, base: string, excludeId?: string) {
  const slug = slugify(base) || (table === "products" ? "item" : "category");
  const like = likeEscape(slug) + "-%";
  const rows =
    table === "products"
      ? await sql`SELECT slug FROM products WHERE store_id = ${storeId} AND (slug = ${slug} OR slug LIKE ${like}) AND id IS DISTINCT FROM ${excludeId ?? null}::bigint`
      : await sql`SELECT slug FROM categories WHERE store_id = ${storeId} AND (slug = ${slug} OR slug LIKE ${like}) AND id IS DISTINCT FROM ${excludeId ?? null}::bigint`;
  const taken = new Set(rows.map((r: any) => r.slug));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}

async function ownCategory(storeId: string, categoryId: unknown): Promise<string | null> {
  if (categoryId === null || categoryId === undefined || categoryId === "") return null;
  const cid = id(categoryId, "category");
  const [c] = await sql`SELECT id FROM categories WHERE id = ${cid} AND store_id = ${storeId}`;
  if (!c) throw bad("Category not found");
  return cid;
}

export function normalizeProduct(p: any): Product {
  return {
    ...p,
    price: Number(p.price),
    compare_at_price: p.compare_at_price === null || p.compare_at_price === undefined ? null : Number(p.compare_at_price),
    cost_price: p.cost_price === null || p.cost_price === undefined ? null : Number(p.cost_price),
  };
}

export type ProductInput = {
  name: string;
  description?: string;
  sku?: string | null;
  price: number | string;
  compare_at_price?: number | string | null;
  cost_price?: number | string | null;
  stock?: number | string;
  low_stock_threshold?: number | string;
  track_stock?: boolean;
  images?: string[];
  status?: string;
  category_id?: string | null;
};

function parseProduct(b: ProductInput) {
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length > 8) throw bad("At most 8 images per product");
  for (const u of images) {
    if (typeof u !== "string" || u.length > 500 || !/^(\/uploads\/|https:\/\/)/.test(u)) throw bad("Invalid image URL");
  }
  const price = num(b.price, "Price", { min: 0, required: true, max: 1e9 })!;
  const compare = num(b.compare_at_price, "Compare-at price", { min: 0, max: 1e9 });
  return {
    name: str(b.name, "Name", { required: true, max: 200 })!,
    description: str(b.description, "Description", { max: 5000 }) ?? "",
    sku: str(b.sku, "SKU", { max: 64 }),
    price,
    compare_at_price: compare && compare > price ? compare : null,
    cost_price: num(b.cost_price, "Cost price", { min: 0, max: 1e9 }),
    stock: int(b.stock, "Stock", { min: 0, max: 10_000_000 }) ?? 0,
    low_stock_threshold: int(b.low_stock_threshold, "Low stock alert", { min: 0, max: 100000 }) ?? 5,
    track_stock: bool(b.track_stock, true),
    images,
    status: oneOf(b.status, "Status", PRODUCT_STATUSES, "active"),
  };
}

// ---- categories ---------------------------------------------------------------------

export async function listCategories(storeId: string): Promise<Category[]> {
  return (await sql`
    SELECT c.id, c.name, c.slug, c.parent_id, c.sort, count(p.id)::int AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    WHERE c.store_id = ${storeId}
    GROUP BY c.id ORDER BY c.sort, c.name`) as Category[];
}

export async function saveCategory(storeId: string, input: { id?: string; name: string; parent_id?: string | null; sort?: number | string }) {
  const name = str(input.name, "Name", { required: true, max: 80 })!;
  const parent = await ownCategory(storeId, input.parent_id);
  const sort = int(input.sort, "Sort") ?? 0;
  if (input.id) {
    const cid = id(input.id);
    if (parent === cid) throw bad("A category cannot be its own parent");
    const [row] = await sql`
      UPDATE categories SET name = ${name}, slug = ${await uniqueSlug("categories", storeId, name, cid)}, parent_id = ${parent}, sort = ${sort}
      WHERE id = ${cid} AND store_id = ${storeId} RETURNING id`;
    if (!row) throw notFound("Category not found");
    return row.id as string;
  }
  const [row] = await sql`
    INSERT INTO categories (store_id, name, slug, parent_id, sort)
    VALUES (${storeId}, ${name}, ${await uniqueSlug("categories", storeId, name)}, ${parent}, ${sort}) RETURNING id`;
  return row.id as string;
}

export async function deleteCategory(storeId: string, categoryId: string) {
  const [row] = await sql`DELETE FROM categories WHERE id = ${id(categoryId)} AND store_id = ${storeId} RETURNING id`;
  if (!row) throw notFound("Category not found");
}

// ---- products -----------------------------------------------------------------------

export type ProductFilters = { q?: string; category?: string; status?: string; stock?: "low" | "out"; page?: number };

export async function listProducts(storeId: string, f: ProductFilters): Promise<Page<Product>> {
  const q = f.q?.trim() || null;
  const category = f.category || null;
  const status = f.status || null;
  const stock = f.stock || null;
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = 25;
  const pattern = q ? `%${likeEscape(q)}%` : null;
  const rows = await sql`
    SELECT p.id, p.category_id, c.name AS category_name, p.name, p.slug, p.description, p.sku, p.price, p.compare_at_price,
           p.cost_price, p.stock, p.low_stock_threshold, p.track_stock, p.images, p.status, p.updated_at,
           count(*) OVER()::int AS total_count
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.store_id = ${storeId}
      AND (${pattern}::text IS NULL OR p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})
      AND (${category}::text IS NULL OR (${category} = 'none' AND p.category_id IS NULL) OR p.category_id::text = ${category})
      AND (${status}::text IS NULL OR (${status} = 'current' AND p.status <> 'archived') OR p.status = ${status})
      AND (${stock}::text IS NULL
           OR (${stock} = 'low' AND p.track_stock AND p.stock > 0 AND p.stock <= p.low_stock_threshold)
           OR (${stock} = 'out' AND p.track_stock AND p.stock <= 0))
    ORDER BY p.created_at DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  return { items: rows.map(({ total_count, ...p }: any) => normalizeProduct(p)), total: rows[0]?.total_count ?? 0, page, pageSize };
}

export async function getProduct(storeId: string, productId: string): Promise<Product> {
  const [row] = await sql`SELECT * FROM products WHERE id = ${id(productId)} AND store_id = ${storeId}`;
  if (!row) throw notFound("Product not found");
  return normalizeProduct(row);
}

export async function createProduct(storeId: string, input: ProductInput): Promise<Product> {
  const p = parseProduct(input);
  const category = await ownCategory(storeId, input.category_id);
  const slug = await uniqueSlug("products", storeId, p.name);
  const row = await sql.begin(async (tx) => {
    const [row] = await tx`
      INSERT INTO products (store_id, category_id, name, slug, description, sku, price, compare_at_price, cost_price,
                            stock, low_stock_threshold, track_stock, images, status)
      VALUES (${storeId}, ${category}, ${p.name}, ${slug}, ${p.description}, ${p.sku}, ${p.price}, ${p.compare_at_price},
              ${p.cost_price}, ${p.stock}, ${p.low_stock_threshold}, ${p.track_stock}, ${p.images}::jsonb, ${p.status})
      RETURNING *`;
    if (p.stock > 0) await tx`INSERT INTO stock_movements (store_id, product_id, change, reason) VALUES (${storeId}, ${row.id}, ${p.stock}, 'initial')`;
    return row;
  });
  return normalizeProduct(row);
}

export async function updateProduct(storeId: string, productId: string, input: ProductInput): Promise<Product> {
  const pid = id(productId);
  const p = parseProduct(input);
  const category = await ownCategory(storeId, input.category_id);
  const slug = await uniqueSlug("products", storeId, p.name, pid);
  const row = await sql.begin(async (tx) => {
    const [cur] = await tx`SELECT stock FROM products WHERE id = ${pid} AND store_id = ${storeId} FOR UPDATE`;
    if (!cur) throw notFound("Product not found");
    const [row] = await tx`
      UPDATE products SET category_id = ${category}, name = ${p.name}, slug = ${slug}, description = ${p.description},
        sku = ${p.sku}, price = ${p.price}, compare_at_price = ${p.compare_at_price}, cost_price = ${p.cost_price},
        stock = ${p.stock}, low_stock_threshold = ${p.low_stock_threshold}, track_stock = ${p.track_stock},
        images = ${p.images}::jsonb, status = ${p.status}, updated_at = now()
      WHERE id = ${pid} RETURNING *`;
    // Editing the stock number in the form is recorded as a manual adjustment.
    const diff = p.stock - cur.stock;
    if (diff !== 0) {
      await tx`INSERT INTO stock_movements (store_id, product_id, change, reason, note)
               VALUES (${storeId}, ${pid}, ${diff}, 'adjust', 'Edited in product form')`;
    }
    return row;
  });
  return normalizeProduct(row);
}

export async function deleteProduct(storeId: string, productId: string) {
  const [row] = await sql`DELETE FROM products WHERE id = ${id(productId)} AND store_id = ${storeId} RETURNING id`;
  if (!row) throw notFound("Product not found");
}

/** Archive or restore (used by delete-with-undo in the UI). */
export async function setProductStatus(storeId: string, productId: string, status: string) {
  const [row] = await sql`
    UPDATE products SET status = ${oneOf(status, "Status", PRODUCT_STATUSES)}, updated_at = now()
    WHERE id = ${id(productId)} AND store_id = ${storeId} RETURNING id`;
  if (!row) throw notFound("Product not found");
}

export async function stockHistory(storeId: string, productId: string): Promise<StockMovement[]> {
  return (await sql`
    SELECT m.id, m.change, m.reason, m.note, m.created_at, o.order_number
    FROM stock_movements m LEFT JOIN orders o ON o.id = m.order_id
    WHERE m.product_id = ${id(productId)} AND m.store_id = ${storeId}
    ORDER BY m.created_at DESC LIMIT 100`) as StockMovement[];
}

const MOVE_REASONS = ["restock", "adjust", "damage", "return"] as const;

export async function adjustStock(storeId: string, productId: string, input: { change: number | string; reason?: string; note?: string }) {
  const pid = id(productId);
  let change = int(input.change, "Change", { required: true, min: -1_000_000, max: 1_000_000 })!;
  if (change === 0) throw bad("Change cannot be zero");
  const reason = oneOf(input.reason, "Reason", MOVE_REASONS, change > 0 ? "restock" : "adjust");
  if (reason === "damage" && change > 0) change = -change;
  const note = str(input.note, "Note", { max: 300 });
  return sql.begin(async (tx) => {
    const [row] = await tx`
      UPDATE products SET stock = stock + ${change}, updated_at = now()
      WHERE id = ${pid} AND store_id = ${storeId} AND stock + ${change} >= 0
      RETURNING id, stock`;
    if (!row) {
      const [exists] = await tx`SELECT 1 FROM products WHERE id = ${pid} AND store_id = ${storeId}`;
      throw exists ? bad("Stock cannot go below zero") : notFound("Product not found");
    }
    await tx`INSERT INTO stock_movements (store_id, product_id, change, reason, note) VALUES (${storeId}, ${pid}, ${change}, ${reason}, ${note})`;
    return { stock: row.stock as number };
  });
}

/** Active products for pickers (manual order form). */
export async function productOptions(storeId: string): Promise<Product[]> {
  const rows = await sql`
    SELECT id, name, sku, price, compare_at_price, cost_price, stock, track_stock, images, status, low_stock_threshold, slug, description,
           category_id, updated_at
    FROM products WHERE store_id = ${storeId} AND status = 'active' ORDER BY name LIMIT 500`;
  return rows.map(normalizeProduct);
}
