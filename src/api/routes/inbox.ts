import { Hono } from "hono";
import { body, query, requires, storeOwner, type ApiEnv } from "../middleware";
import * as inbox from "~/server/services/inbox";

export const conversations = new Hono<ApiEnv>()
  .use(storeOwner, requires("inbox"))
  .get("/", query<{ channel?: string }>(), async (c) => c.json(await inbox.listConversations(c.get("storeId"), c.req.valid("query").channel || null)))
  .get("/unread", async (c) => c.json(await inbox.unreadCount(c.get("storeId"))))
  /** Simulate an incoming message (for trying the inbox before connecting a channel). */
  .post("/test", body<{ channel: string; from: string; name?: string; text: string }>(), async (c) =>
    c.json(await inbox.testMessage(c.get("storeId"), c.req.valid("json")), 201),
  )
  .get("/:id", async (c) => c.json(await inbox.getThread(c.get("storeId"), c.req.param("id"))))
  .post("/:id/replies", body<{ text: string }>(), async (c) => c.json(await inbox.sendReply(c.get("storeId"), c.req.param("id"), c.req.valid("json").text), 201));

type ChannelInput = { external_id: string; access_token?: string; display_name?: string; enabled?: boolean };

export const channels = new Hono<ApiEnv>()
  .use(storeOwner, requires("channels"))
  .get("/", async (c) => c.json(await inbox.listChannels(c.get("storeId"))))
  .put("/:type", body<ChannelInput>(), async (c) => c.json(await inbox.saveChannel(c.get("storeId"), { ...c.req.valid("json"), type: c.req.param("type") })))
  .delete("/:type", async (c) => c.json(await inbox.deleteChannel(c.get("storeId"), c.req.param("type"))));
