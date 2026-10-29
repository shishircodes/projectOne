import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel, Incoming } from "./index";

// TikTok Business Messaging is gated (approved partners / supported regions only).
// Signature check follows TikTok's webhook scheme: header `TikTok-Signature: t=<ts>,s=<hex hmac>`
// where s = HMAC-SHA256(client_secret, `${t}.${rawBody}`). Field names in the payload
// mapping below should be confirmed against the docs for your approved app.

export function verifyTikTokSignature(raw: string, header: string | null): boolean {
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]));
  if (!parts.t || !parts.s) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false; // replay window
  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest();
  const got = Buffer.from(parts.s, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function parseTikTokWebhook(payload: any): Incoming[] {
  // `content` may arrive as a JSON string.
  let c = payload?.content ?? payload?.data ?? payload;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      return [];
    }
  }
  const events = Array.isArray(c) ? c : [c];
  const out: Incoming[] = [];
  for (const e of events) {
    const accountId = e?.business_id ?? payload?.user_openid ?? payload?.business_id;
    const userId = e?.conversation_id ?? e?.sender?.id ?? e?.from_user_id;
    const text = e?.message?.text?.body ?? e?.text?.body ?? e?.text ?? (e?.message_type ? `[${e.message_type}]` : null);
    if (!accountId || !userId || !text) continue;
    out.push({
      type: "tiktok",
      accountId: String(accountId),
      userId: String(userId),
      userName: e?.sender?.display_name ?? null,
      text: String(text),
      messageId: e?.message_id ?? null,
      at: e?.timestamp ? new Date(Number(e.timestamp) * (String(e.timestamp).length > 11 ? 1 : 1000)) : undefined,
    });
  }
  return out;
}

export async function sendTikTok(channel: Channel, conversationId: string, text: string): Promise<string | null> {
  const url = process.env.TIKTOK_SEND_URL || "https://business-api.tiktok.com/open_api/v1.3/business/message/send/";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Access-Token": channel.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_id: channel.external_id,
      recipient_type: "CONVERSATION",
      recipient: conversationId,
      message_type: "TEXT",
      text: { body: text },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || (body.code !== undefined && body.code !== 0)) throw new Error(body?.message ?? `TikTok API error ${res.status}`);
  return body?.data?.message_id ?? null;
}
