import { Hono } from "hono";
import { body, query, requires, storeOwner, type ApiEnv } from "../middleware";
import { sql } from "~/server/db";
import { setPublished, updateStore, type StoreInput } from "~/server/services/account";
import { getStats } from "~/server/services/stats";
import { searchEverything } from "~/server/services/search";

/** The store open in this session: its settings, dashboard numbers and search. */
export const store = new Hono<ApiEnv>()
  .use(storeOwner)
  .get("/", (c) => c.json(c.get("store")))
  .put("/", body<StoreInput>(), async (c) => c.json(await updateStore(c.get("storeId"), c.req.valid("json"), c.get("session").user.features)))
  .put("/published", requires("storefront"), body<{ published: boolean }>(), async (c) =>
    c.json(await setPublished(c.get("storeId"), !!c.req.valid("json").published)),
  )

  /** Badge counts for the navigation (unread chats, orders waiting for action), filtered to the user's features. */
  .get("/counts", async (c) => {
    const id = c.get("storeId");
    const [r] = await sql`
      SELECT (SELECT coalesce(sum(unread), 0)::int FROM conversations WHERE store_id = ${id}) AS unread,
             (SELECT count(*)::int FROM orders WHERE store_id = ${id} AND status = 'pending') AS pending`;
    const can = (f: string) => c.get("session").user.features.includes(f as any);
    return c.json({ unread: can("inbox") ? (r.unread as number) : 0, pending: can("orders") ? (r.pending as number) : 0 });
  })

  .get("/stats", requires("analytics"), query<{ days?: string }>(), async (c) => c.json(await getStats(c.get("storeId"), Number(c.req.valid("query").days ?? 30))))

  // Open to every store owner; results are filtered to the features they have.
  .get("/search", query<{ q?: string }>(), async (c) =>
    c.json(await searchEverything(c.get("storeId"), String(c.req.valid("query").q ?? ""), c.get("session").user.features)),
  );
