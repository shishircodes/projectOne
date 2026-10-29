import { sql } from "../db";
import { decrypt } from "../crypto";
import { publish } from "../realtime";
import { sendMeta, lookupMetaName } from "./meta";
import { sendTikTok } from "./tiktok";

export const CHANNEL_TYPES = ["whatsapp", "messenger", "instagram", "tiktok"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export type Channel = { id: string; store_id: string; type: ChannelType; external_id: string; token: string };

export type Incoming = {
  type: ChannelType;
  accountId: string; // which business account received it (maps to a store)
  userId: string; // sender id on the platform
  userName?: string | null;
  text: string;
  messageId?: string | null;
  at?: Date;
};

async function channelFor(type: ChannelType, externalId: string): Promise<Channel | null> {
  const [c] = await sql`SELECT id, store_id, type, external_id, access_token FROM channels
                        WHERE type = ${type} AND external_id = ${externalId} AND enabled`;
  if (!c) return null;
  return { id: c.id, store_id: c.store_id, type: c.type, external_id: c.external_id, token: decrypt(c.access_token) };
}

async function storeChannel(storeId: string, type: ChannelType): Promise<Channel | null> {
  const [c] = await sql`SELECT id, store_id, type, external_id, access_token FROM channels
                        WHERE store_id = ${storeId} AND type = ${type} AND enabled`;
  if (!c) return null;
  return { id: c.id, store_id: c.store_id, type: c.type, external_id: c.external_id, token: decrypt(c.access_token) };
}

/** Store an inbound message in the store's unified inbox and push it to open dashboards. */
export async function ingest(msg: Incoming, opts: { storeId?: string; test?: boolean } = {}) {
  let storeId = opts.storeId;
  let channel: Channel | null = null;
  if (!storeId) {
    channel = await channelFor(msg.type, msg.accountId);
    if (!channel) {
      console.warn(`[inbox] no store connected for ${msg.type} account ${msg.accountId}`);
      return null;
    }
    storeId = channel.store_id;
  }

  let name = msg.userName ?? null;
  if (!name && channel && (msg.type === "messenger" || msg.type === "instagram")) {
    const [known] = await sql`SELECT customer_name FROM conversations
                              WHERE store_id = ${storeId} AND channel = ${msg.type} AND external_user_id = ${msg.userId}`;
    name = known?.customer_name ?? (await lookupMetaName(channel, msg.userId));
  }

  const text = msg.text.slice(0, 4000);
  const at = msg.at ?? new Date();
  const result = await sql.begin(async (tx) => {
    const [conv] = await tx`
      INSERT INTO conversations (store_id, channel, external_user_id, customer_name, last_message, last_message_at, unread)
      VALUES (${storeId}, ${msg.type}, ${msg.userId}, ${name}, ${text}, ${at}, 1)
      ON CONFLICT (store_id, channel, external_user_id) DO UPDATE SET
        customer_name = coalesce(EXCLUDED.customer_name, conversations.customer_name),
        last_message = EXCLUDED.last_message, last_message_at = EXCLUDED.last_message_at,
        unread = conversations.unread + 1
      RETURNING id, channel, external_user_id, customer_name, last_message, last_message_at, unread`;
    const [m] = await tx`
      INSERT INTO messages (conversation_id, direction, body, external_id, status, created_at)
      VALUES (${conv.id}, 'in', ${text}, ${msg.messageId ?? null}, ${opts.test ? "test" : "received"}, ${at})
      ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
      RETURNING id, direction, body, status, created_at`;
    if (!m) throw new DuplicateMessage(); // webhook retry: roll back the unread bump
    return { conv, m };
  }).catch((e) => {
    if (e instanceof DuplicateMessage) return null;
    throw e;
  });
  if (result) publish(storeId, "message:new", { conversation: result.conv, message: result.m });
  return result;
}
class DuplicateMessage extends Error {}

/** Send a reply through the conversation's channel and record it. */
export async function reply(storeId: string, conversationId: string, text: string) {
  const [conv] = await sql`SELECT id, channel, external_user_id FROM conversations WHERE id = ${conversationId} AND store_id = ${storeId}`;
  if (!conv) return null;

  const isTest = conv.external_user_id.startsWith("test-");
  const channel = isTest ? null : await storeChannel(storeId, conv.channel);
  let status: "sent" | "failed" | "test" = "sent";
  let externalId: string | null = null;
  let error: string | null = null;
  if (isTest) {
    status = "test";
  } else if (!channel) {
    status = "failed";
    error = `No ${conv.channel} account connected`;
  } else {
    try {
      externalId = channel.type === "tiktok" ? await sendTikTok(channel, conv.external_user_id, text) : await sendMeta(channel, conv.external_user_id, text);
    } catch (e: any) {
      status = "failed";
      error = String(e?.message ?? e).slice(0, 500);
    }
  }

  const [m] = await sql`
    INSERT INTO messages (conversation_id, direction, body, external_id, status, error)
    VALUES (${conv.id}, 'out', ${text}, ${externalId}, ${status}, ${error})
    RETURNING id, direction, body, status, error, created_at`;
  const [c] = await sql`
    UPDATE conversations SET last_message = ${text}, last_message_at = now(), unread = 0 WHERE id = ${conv.id}
    RETURNING id, channel, external_user_id, customer_name, last_message, last_message_at, unread`;
  publish(storeId, "message:new", { conversation: c, message: m });
  return m;
}
