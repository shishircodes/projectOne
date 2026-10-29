import { sql } from "../db";
import { publish } from "../realtime";
import { bad, HttpError, id, int, likeEscape, notFound, num, oneOf, str } from "../errors";
import { newOrderToken, verifyOrderPayments } from "../payments";
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PROVINCES,
  SOURCES,
  type Order,
  type OrderStatus,
  type OrderSummary,
  type Page,
  type PaymentAttempt,
  type PaymentMethod,
  type Source,
} from "~/lib/types";

const FINAL = new Set(["cancelled", "returned"]);

// Nepali mobile numbers: 98XXXXXXXX / 97XXXXXXXX, optional +977 prefix. Landlines allowed loosely.
export function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/[^\d]/g, "").replace(/^977/, "");
  if (!/^(9[678]\d{8}|0?\d{6,9})$/.test(digits)) throw bad("Enter a valid Nepali phone number, e.g. 98XXXXXXXX");
  return digits;
}

export type OrderInput = {
  items: { product_id: string; quantity: number }[];
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  inside_valley: boolean;
  note: string | null;
  source: Source;
  payment_method: PaymentMethod;
  delivery_fee?: number | null; // manual orders may override
  discount?: number;
  conversation_id?: string | null;
};

export type RawOrderInput = Record<string, unknown> & { items?: { product_id: string; quantity: number | string }[] };

export function parseOrderInput(b: RawOrderInput, { manual }: { manual: boolean }): OrderInput {
  if (!Array.isArray(b.items) || b.items.length === 0) throw bad("Add at least one item");
  if (b.items.length > 100) throw bad("Too many items");
  const merged = new Map<string, number>();
  for (const it of b.items) {
    const pid = id(it?.product_id, "product");
    const qty = int(it?.quantity, "Quantity", { required: true, min: 1, max: 999 })!;
    merged.set(pid, (merged.get(pid) ?? 0) + qty);
  }
  const province = str(b.province, "Province", { max: 30 });
  if (province && !PROVINCES.includes(province as any)) throw bad("Choose a valid province");
  return {
    items: [...merged].map(([product_id, quantity]) => ({ product_id, quantity })),
    customer_name: str(b.customer_name, "Name", { required: true, max: 100 })!,
    customer_phone: normalizePhone(b.customer_phone),
    customer_email: str(b.customer_email, "Email", { max: 200 }),
    province,
    city: str(b.city, "City", { max: 80, required: !manual }),
    address: str(b.address, "Address", { max: 300, required: !manual }),
    inside_valley: b.inside_valley === true || b.inside_valley === "true",
    note: str(b.note, "Note", { max: 500 }),
    source: manual ? oneOf(b.source, "Source", SOURCES, "walkin") : "website",
    payment_method: oneOf(b.payment_method, "Payment method", PAYMENT_METHODS, "cod"),
    delivery_fee: manual ? num(b.delivery_fee, "Delivery fee", { min: 0, max: 100000 }) : undefined,
    discount: manual ? num(b.discount, "Discount", { min: 0, max: 1e9 }) ?? 0 : 0,
    conversation_id: manual && b.conversation_id ? id(b.conversation_id, "conversation") : null,
  };
}

/** Creates an order atomically: locks products, checks & deducts stock, logs movements. */
export async function createOrder(store: { id: string; delivery_fee_inside: number; delivery_fee_outside: number; free_delivery_over: number | null }, input: OrderInput, { onlyActive }: { onlyActive: boolean }) {
  const order = await sql.begin(async (tx) => {
    const ids = input.items.map((i) => i.product_id);
    const products = await tx`
      SELECT id, name, price, cost_price, stock, track_stock, status FROM products
      WHERE store_id = ${store.id} AND id IN ${tx(ids)}
      ORDER BY id FOR UPDATE`;
    const byId = new Map(products.map((p: any) => [String(p.id), p]));

    let subtotal = 0;
    const lines = input.items.map((it) => {
      const p: any = byId.get(it.product_id);
      if (!p || (onlyActive && p.status !== "active")) throw bad("A product in this order is no longer available");
      if (p.track_stock && p.stock < it.quantity) {
        throw new HttpError(409, p.stock > 0 ? `Only ${p.stock} left of "${p.name}"` : `"${p.name}" is out of stock`);
      }
      subtotal += Number(p.price) * it.quantity;
      return { p, quantity: it.quantity };
    });
    subtotal = Math.round(subtotal * 100) / 100;

    let delivery = input.delivery_fee ?? Number(input.inside_valley ? store.delivery_fee_inside : store.delivery_fee_outside);
    if (input.delivery_fee == null && store.free_delivery_over != null && subtotal >= Number(store.free_delivery_over)) delivery = 0;
    const discount = Math.min(input.discount ?? 0, subtotal);
    const total = Math.round((subtotal + delivery - discount) * 100) / 100;

    if (input.conversation_id) {
      const [c] = await tx`SELECT 1 FROM conversations WHERE id = ${input.conversation_id} AND store_id = ${store.id}`;
      if (!c) throw bad("Conversation not found");
    }
    const [{ order_seq }] = await tx`UPDATE stores SET order_seq = order_seq + 1 WHERE id = ${store.id} RETURNING order_seq`;
    const [order] = await tx`
      INSERT INTO orders (store_id, order_number, customer_name, customer_phone, customer_email, province, city, address,
                          inside_valley, note, source, payment_method, subtotal, delivery_fee, discount, total, conversation_id, public_token)
      VALUES (${store.id}, ${order_seq}, ${input.customer_name}, ${input.customer_phone}, ${input.customer_email},
              ${input.province}, ${input.city}, ${input.address}, ${input.inside_valley}, ${input.note}, ${input.source},
              ${input.payment_method}, ${subtotal}, ${delivery}, ${discount}, ${total}, ${input.conversation_id ?? null}, ${newOrderToken()})
      RETURNING id, order_number, total, status, created_at, public_token`;

    for (const { p, quantity } of lines) {
      await tx`INSERT INTO order_items (order_id, product_id, name, price, cost_price, quantity)
               VALUES (${order.id}, ${p.id}, ${p.name}, ${p.price}, ${p.cost_price}, ${quantity})`;
      if (p.track_stock) {
        await tx`UPDATE products SET stock = stock - ${quantity}, updated_at = now() WHERE id = ${p.id}`;
        await tx`INSERT INTO stock_movements (store_id, product_id, change, reason, order_id)
                 VALUES (${store.id}, ${p.id}, ${-quantity}, 'sale', ${order.id})`;
      }
    }
    return {
      id: order.id as string,
      order_number: order.order_number as number,
      total: Number(order.total),
      public_token: order.public_token as string,
      customer_name: input.customer_name,
      source: input.source,
    };
  });
  publish(store.id, "order:new", order);
  return order;
}

const orderPayments = async (orderId: string) =>
  (await sql`
    SELECT id, provider, mode, merchant_ref, amount::float8 AS amount, status, provider_status, provider_txn_id, created_at
    FROM payments WHERE order_id = ${orderId} ORDER BY created_at DESC`) as PaymentAttempt[];

const ORDER_COLS = () =>
  sql.unsafe(`o.id, o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.province, o.city,
   o.address, o.inside_valley, o.note, o.source, o.status, o.payment_method, o.payment_status, o.payment_ref,
   o.subtotal::float8 AS subtotal, o.delivery_fee::float8 AS delivery_fee, o.discount::float8 AS discount,
   o.total::float8 AS total, o.conversation_id, o.public_token, o.created_at`);

export type OrderFilters = { q?: string; status?: string; source?: string; page?: number };

export async function listOrders(storeId: string, f: OrderFilters): Promise<Page<OrderSummary> & { counts: Record<string, number> }> {
  const q = f.q?.trim() || null;
  const status = f.status || null;
  const source = f.source || null;
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = 25;
  const pattern = q ? `%${likeEscape(q)}%` : null;
  const [rows, counts] = await Promise.all([
    sql`
      SELECT o.id, o.order_number, o.customer_name, o.customer_phone, o.source, o.status, o.payment_method, o.payment_status,
             o.total::float8 AS total, o.created_at,
             (SELECT coalesce(sum(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS item_count,
             count(*) OVER()::int AS total_count
      FROM orders o
      WHERE o.store_id = ${storeId}
        AND (${status}::text IS NULL OR o.status = ${status})
        AND (${source}::text IS NULL OR o.source = ${source})
        AND (${pattern}::text IS NULL OR o.customer_name ILIKE ${pattern} OR o.customer_phone LIKE ${pattern} OR o.order_number::text = ${q})
      ORDER BY o.created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    // Counts per status for the pipeline tabs (respecting search/channel, not the status filter itself).
    sql`
      SELECT status, count(*)::int AS n FROM orders o
      WHERE o.store_id = ${storeId}
        AND (${source}::text IS NULL OR o.source = ${source})
        AND (${pattern}::text IS NULL OR o.customer_name ILIKE ${pattern} OR o.customer_phone LIKE ${pattern} OR o.order_number::text = ${q})
      GROUP BY status`,
  ]);
  return {
    items: rows.map(({ total_count, ...o }: any) => o) as OrderSummary[],
    total: rows[0]?.total_count ?? 0,
    page,
    pageSize,
    counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])),
  };
}

export async function getOrder(storeId: string, orderId: string): Promise<Order> {
  const oid = id(orderId);
  const [order] = await sql`
    SELECT ${ORDER_COLS()}, (SELECT coalesce(sum(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o WHERE o.id = ${oid} AND o.store_id = ${storeId}`;
  if (!order) throw notFound("Order not found");
  const [items, payments] = await Promise.all([
    sql`SELECT id, product_id, name, price::float8 AS price, quantity FROM order_items WHERE order_id = ${oid} ORDER BY id`,
    orderPayments(oid),
  ]);
  return { ...order, items, payments } as Order;
}

export async function updateOrder(storeId: string, orderId: string, input: { status?: string; payment_status?: string }) {
  const oid = id(orderId);
  return sql.begin(async (tx) => {
    const [cur] = await tx`SELECT id, status, payment_status FROM orders WHERE id = ${oid} AND store_id = ${storeId} FOR UPDATE`;
    if (!cur) throw notFound("Order not found");
    const status = oneOf(input.status, "Status", ORDER_STATUSES, cur.status) as OrderStatus;
    const payment = oneOf(input.payment_status, "Payment status", PAYMENT_STATUSES, cur.payment_status);
    if (FINAL.has(cur.status) && status !== cur.status) throw bad(`A ${cur.status} order cannot change status`);

    // Cancelling / returning puts tracked stock back.
    if (FINAL.has(status) && !FINAL.has(cur.status)) {
      const items = await tx`
        SELECT oi.product_id, oi.quantity FROM order_items oi JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ${oid} AND p.track_stock`;
      for (const it of items) {
        await tx`UPDATE products SET stock = stock + ${it.quantity}, updated_at = now() WHERE id = ${it.product_id}`;
        await tx`INSERT INTO stock_movements (store_id, product_id, change, reason, order_id)
                 VALUES (${storeId}, ${it.product_id}, ${it.quantity}, ${status === "cancelled" ? "cancel" : "return"}, ${oid})`;
      }
    }
    const [row] = await tx`
      UPDATE orders SET status = ${status}, payment_status = ${payment}, updated_at = now()
      WHERE id = ${oid} RETURNING id, status, payment_status`;
    return row as { id: string; status: OrderStatus; payment_status: string };
  });
}

/** Ask eSewa / Khalti again about unfinished attempts. */
export async function recheckPayments(storeId: string, orderId: string) {
  const oid = id(orderId);
  const [o] = await sql`SELECT id FROM orders WHERE id = ${oid} AND store_id = ${storeId}`;
  if (!o) throw notFound("Order not found");
  const errors = await verifyOrderPayments(oid);
  const [after] = await sql`SELECT payment_status FROM orders WHERE id = ${oid}`;
  return { payment_status: after.payment_status as string, errors };
}
