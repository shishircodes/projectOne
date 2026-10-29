import { sql, TZ } from "../db";

export type StatsDays = 7 | 30 | 90 | 365;

// Orders that count as sales: cancelled/returned are excluded from revenue.
export async function getStats(storeId: string, requestedDays: number) {
  const days = ([7, 30, 90, 365] as const).includes(requestedDays as StatsDays) ? requestedDays : 30;
  const sid = storeId;

  // Window boundaries are whole days in Nepal time; "today" is included.
  const [range] = await sql`
    SELECT ((date_trunc('day', now() AT TIME ZONE ${TZ}) - make_interval(days => ${days - 1})) AT TIME ZONE ${TZ}) AS start,
           ((date_trunc('day', now() AT TIME ZONE ${TZ}) - make_interval(days => ${2 * days - 1})) AT TIME ZONE ${TZ}) AS prev_start`;

  const [kpi, prev, daily, bySource, byStatus, byProvince, topProducts, lowStock, inventory, inbox] = await Promise.all([
    sql`
      SELECT coalesce(sum(total), 0)::float8 AS revenue, count(*)::int AS orders,
             count(DISTINCT customer_phone)::int AS customers,
             coalesce(sum(total) FILTER (WHERE payment_status = 'paid'), 0)::float8 AS collected
      FROM orders WHERE store_id = ${sid} AND created_at >= ${range.start} AND status NOT IN ('cancelled','returned')`,
    sql`
      SELECT coalesce(sum(total), 0)::float8 AS revenue, count(*)::int AS orders
      FROM orders WHERE store_id = ${sid} AND created_at >= ${range.prev_start} AND created_at < ${range.start}
        AND status NOT IN ('cancelled','returned')`,
    sql`
      WITH d AS (
        SELECT generate_series(date_trunc('day', ${range.start}::timestamptz AT TIME ZONE ${TZ}),
                               date_trunc('day', now() AT TIME ZONE ${TZ}), interval '1 day')::date AS day
      ),
      o AS (
        SELECT (created_at AT TIME ZONE ${TZ})::date AS day, sum(total) AS revenue, count(*) AS orders
        FROM orders WHERE store_id = ${sid} AND created_at >= ${range.start} AND status NOT IN ('cancelled','returned')
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(o.revenue, 0)::float8 AS revenue, coalesce(o.orders, 0)::int AS orders
      FROM d LEFT JOIN o USING (day) ORDER BY d.day`,
    sql`
      SELECT source, count(*)::int AS orders, sum(total)::float8 AS revenue
      FROM orders WHERE store_id = ${sid} AND created_at >= ${range.start} AND status NOT IN ('cancelled','returned')
      GROUP BY source ORDER BY revenue DESC`,
    sql`
      SELECT status, count(*)::int AS orders FROM orders
      WHERE store_id = ${sid} AND created_at >= ${range.start} GROUP BY status`,
    sql`
      SELECT coalesce(province, 'Unknown') AS province, count(*)::int AS orders, sum(total)::float8 AS revenue
      FROM orders WHERE store_id = ${sid} AND created_at >= ${range.start} AND status NOT IN ('cancelled','returned')
      GROUP BY 1 ORDER BY revenue DESC`,
    sql`
      SELECT oi.name, sum(oi.quantity)::int AS units, sum(oi.price * oi.quantity)::float8 AS revenue,
             sum((oi.price - oi.cost_price) * oi.quantity)::float8 AS profit
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.store_id = ${sid} AND o.created_at >= ${range.start} AND o.status NOT IN ('cancelled','returned')
      GROUP BY oi.name ORDER BY revenue DESC LIMIT 8`,
    sql`
      SELECT id, name, stock, low_stock_threshold FROM products
      WHERE store_id = ${sid} AND track_stock AND status = 'active' AND stock <= low_stock_threshold
      ORDER BY stock, name LIMIT 10`,
    sql`
      SELECT count(*)::int AS products,
             coalesce(sum(stock * coalesce(cost_price, price)) FILTER (WHERE track_stock AND stock > 0), 0)::float8 AS stock_value,
             count(*) FILTER (WHERE track_stock AND stock <= 0 AND status = 'active')::int AS out_of_stock
      FROM products WHERE store_id = ${sid} AND status <> 'archived'`,
    sql`SELECT coalesce(sum(unread), 0)::int AS unread FROM conversations WHERE store_id = ${sid}`,
  ]);

  const [profit] = await sql`
    SELECT coalesce(sum((oi.price - oi.cost_price) * oi.quantity), 0)::float8 AS gross_profit
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = ${sid} AND o.created_at >= ${range.start} AND o.status NOT IN ('cancelled','returned')
      AND oi.cost_price IS NOT NULL`;

  return {
    days,
    kpi: {
      revenue: kpi[0].revenue as number,
      orders: kpi[0].orders as number,
      customers: kpi[0].customers as number,
      collected: kpi[0].collected as number,
      aov: kpi[0].orders ? kpi[0].revenue / kpi[0].orders : 0,
      gross_profit: profit.gross_profit as number,
      prev_revenue: prev[0].revenue as number,
      prev_orders: prev[0].orders as number,
      products: inventory[0].products as number,
      stock_value: inventory[0].stock_value as number,
      out_of_stock: inventory[0].out_of_stock as number,
      unread_messages: inbox[0].unread as number,
    },
    daily: daily as unknown as { day: string; revenue: number; orders: number }[],
    bySource: bySource as unknown as { source: string; orders: number; revenue: number }[],
    byStatus: byStatus as unknown as { status: string; orders: number }[],
    byProvince: byProvince as unknown as { province: string; orders: number; revenue: number }[],
    topProducts: topProducts as unknown as { name: string; units: number; revenue: number; profit: number | null }[],
    lowStock: lowStock as unknown as { id: string; name: string; stock: number; low_stock_threshold: number }[],
  };
}
