import { Hono } from "hono";
import { body, query, requires, storeOwner, type ApiEnv } from "../middleware";
import * as orders from "~/server/services/orders";

type OrderQuery = { q?: string; status?: string; source?: string; page?: string };

export const ordersApi = new Hono<ApiEnv>()
  .use(storeOwner, requires("orders"))
  .get("/", query<OrderQuery>(), async (c) => {
    const f = c.req.valid("query");
    return c.json(await orders.listOrders(c.get("storeId"), { ...f, page: f.page ? Number(f.page) : undefined }));
  })
  // Orders entered by the seller (phone, walk-in, social): any status and source, inactive products allowed.
  .post("/", body<orders.RawOrderInput>(), async (c) =>
    c.json(await orders.createOrder(c.get("store"), orders.parseOrderInput(c.req.valid("json"), { manual: true }), { onlyActive: false }), 201),
  )
  .get("/:id", async (c) => c.json(await orders.getOrder(c.get("storeId"), c.req.param("id"))))
  .patch("/:id", body<{ status?: string; payment_status?: string }>(), async (c) =>
    c.json(await orders.updateOrder(c.get("storeId"), c.req.param("id"), c.req.valid("json"))),
  )
  /** Ask eSewa/Khalti again about this order's open payment attempts. */
  .post("/:id/recheck-payments", async (c) => c.json(await orders.recheckPayments(c.get("storeId"), c.req.param("id"))));
