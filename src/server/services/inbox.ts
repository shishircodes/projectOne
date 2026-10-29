import { sql } from "../db";
import { encrypt } from "../crypto";
import { CHANNEL_TYPES, ingest, reply } from "../channels";
import { bad, bool, HttpError, id, notFound, oneOf, str } from "../errors";
import type { Channel, Conversation, Message } from "~/lib/types";

export async function listConversations(storeId: string, channel?: string | null): Promise<Conversation[]> {
  return (await sql`
    SELECT id, channel, external_user_id, customer_name, last_message, last_message_at, unread
    FROM conversations
    WHERE store_id = ${storeId} AND (${channel ?? null}::text IS NULL OR channel = ${channel ?? null})
    ORDER BY last_message_at DESC LIMIT 200`) as Conversation[];
}

export async function unreadCount(storeId: string) {
  const [r] = await sql`SELECT coalesce(sum(unread), 0)::int AS n FROM conversations WHERE store_id = ${storeId}`;
  return r.n as number;
}

/** Open a conversation: marks it read and returns messages + linked orders. */
export async function getThread(storeId: string, conversationId: string) {
  const cid = id(conversationId);
  const [conversation] = await sql`
    UPDATE conversations SET unread = 0 WHERE id = ${cid} AND store_id = ${storeId}
    RETURNING id, channel, external_user_id, customer_name, last_message, last_message_at, unread`;
  if (!conversation) throw notFound("Conversation not found");
  const [messages, orders] = await Promise.all([
    sql`SELECT id, direction, body, status, error, created_at FROM (
          SELECT * FROM messages WHERE conversation_id = ${cid} ORDER BY created_at DESC LIMIT 300
        ) m ORDER BY created_at`,
    sql`SELECT id, order_number, status, payment_status, total::float8 AS total, created_at FROM orders
        WHERE conversation_id = ${cid} ORDER BY created_at DESC LIMIT 10`,
  ]);
  return {
    conversation: conversation as Conversation,
    messages: messages as Message[],
    orders: orders as { id: string; order_number: number; status: string; payment_status: string; total: number; created_at: string }[],
  };
}

export async function sendReply(storeId: string, conversationId: string, text: unknown) {
  const body = str(text, "Message", { required: true, max: 4000 })!;
  const m = await reply(storeId, id(conversationId), body);
  if (!m) throw notFound("Conversation not found");
  return m as Message;
}

/** Simulate a customer message so owners can try the inbox before connecting accounts. */
export async function testMessage(storeId: string, input: { channel: string; from: string; name?: string; text: string }) {
  const type = oneOf(input.channel, "Channel", CHANNEL_TYPES);
  const r = await ingest(
    {
      type,
      accountId: "test",
      userId: `test-${str(input.from, "From", { required: true, max: 40 })}`,
      userName: str(input.name, "Name", { max: 80 }),
      text: str(input.text, "Message", { required: true, max: 1000 })!,
    },
    { storeId, test: true },
  );
  return (r?.conv ?? null) as Conversation | null;
}

// ---- channels ----------------------------------------------------------------------

export async function listChannels(storeId: string) {
  const rows = await sql`SELECT type, external_id, display_name, enabled, created_at FROM channels WHERE store_id = ${storeId}`;
  const base = process.env.PUBLIC_URL ?? "";
  return {
    channels: rows as { type: Channel; external_id: string; display_name: string | null; enabled: boolean; created_at: string }[],
    webhooks: {
      meta: { url: `${base}/webhooks/meta`, verifyToken: process.env.META_VERIFY_TOKEN || null, configured: !!process.env.META_APP_SECRET },
      tiktok: { url: `${base}/webhooks/tiktok`, configured: !!process.env.TIKTOK_CLIENT_SECRET },
    },
  };
}

export async function saveChannel(
  storeId: string,
  input: { type: string; external_id: string; access_token?: string; display_name?: string; enabled?: boolean },
) {
  const type = oneOf(input.type, "Channel", CHANNEL_TYPES);
  const externalId = str(input.external_id, "Account ID", { required: true, max: 100 })!;
  if (!/^[\w.-]+$/.test(externalId)) throw bad("Account ID should only contain letters, digits, dots, dashes");
  const token = str(input.access_token, "Access token", { max: 2000 });
  const name = str(input.display_name, "Display name", { max: 100 });
  const enabled = bool(input.enabled, true);
  const [existing] = await sql`SELECT id FROM channels WHERE store_id = ${storeId} AND type = ${type}`;
  if (!existing && !token) throw bad("Access token is required");
  const [taken] = await sql`SELECT 1 FROM channels WHERE type = ${type} AND external_id = ${externalId} AND store_id <> ${storeId}`;
  if (taken) throw new HttpError(409, "This account is already connected to another store");
  if (existing) {
    await sql`
      UPDATE channels SET external_id = ${externalId}, display_name = ${name}, enabled = ${enabled},
        access_token = coalesce(${token ? encrypt(token) : null}, access_token)
      WHERE id = ${existing.id}`;
  } else {
    await sql`
      INSERT INTO channels (store_id, type, external_id, access_token, display_name, enabled)
      VALUES (${storeId}, ${type}, ${externalId}, ${encrypt(token!)}, ${name}, ${enabled})`;
  }
}

export async function deleteChannel(storeId: string, type: string) {
  await sql`DELETE FROM channels WHERE store_id = ${storeId} AND type = ${oneOf(type, "Channel", CHANNEL_TYPES)}`;
}
