import { Hono } from "hono";
import { adminOnly, body, query, type ApiEnv } from "../middleware";
import * as admin from "~/server/services/admin";

type NewAccount = { name: string; email: string; storeName?: string; makeAdmin?: boolean; features?: string[]; maxStores?: number };

/** Platform admin console: invite-only accounts, their features and store limits. */
export const adminApi = new Hono<ApiEnv>()
  .use(adminOnly)
  .get("/accounts", query<{ q?: string }>(), async (c) => c.json(await admin.listAccounts(c.req.valid("query").q)))
  .post("/accounts", body<NewAccount>(), async (c) => c.json(await admin.createAccount(c.get("session").user.id, c.req.valid("json")), 201))
  .post("/accounts/:id/stores", body<{ storeName: string }>(), async (c) => c.json(await admin.createStoreFor(c.req.param("id"), c.req.valid("json").storeName), 201))
  .post("/accounts/:id/reset-password", async (c) => c.json(await admin.resetPassword(c.req.param("id"))))
  .put("/accounts/:id/disabled", body<{ disabled: boolean }>(), async (c) =>
    c.json(await admin.setDisabled(c.get("session").user.id, c.req.param("id"), !!c.req.valid("json").disabled)),
  )
  .put("/accounts/:id/admin", body<{ isAdmin: boolean }>(), async (c) =>
    c.json(await admin.setAdmin(c.get("session").user.id, c.req.param("id"), !!c.req.valid("json").isAdmin)),
  )
  .put("/accounts/:id/access", body<{ features: string[]; maxStores: number }>(), async (c) => c.json(await admin.setAccess(c.req.param("id"), c.req.valid("json"))));
