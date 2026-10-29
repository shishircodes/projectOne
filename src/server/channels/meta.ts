import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel, Incoming } from "./index";

// WhatsApp Cloud API, Messenger and Instagram Messaging all arrive through one Meta app webhook.
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

export function verifyMetaSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function describeWhatsApp(m: any): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "image":
    case "video":
    case "document":
      return m[m.type]?.caption ? `[${m.type}] ${m[m.type].caption}` : `[${m.type}]`;
    case "button":
      return m.button?.text ?? "[button]";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[interactive]";
    case "location":
      return `[location] ${m.location?.latitude},${m.location?.longitude}`;
    default:
      return `[${m.type ?? "message"}]`;
  }
}

/** Normalise a Meta webhook payload into inbox messages. */
export function parseMetaWebhook(payload: any): Incoming[] {
  const out: Incoming[] = [];
  if (payload?.object === "whatsapp_business_account") {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const accountId = v.metadata?.phone_number_id;
        const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) {
          out.push({
            type: "whatsapp",
            accountId,
            userId: m.from,
            userName: names.get(m.from) ?? null,
            text: describeWhatsApp(m),
            messageId: m.id,
            at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined,
          });
        }
      }
    }
  } else if (payload?.object === "page" || payload?.object === "instagram") {
    const type = payload.object === "page" ? "messenger" : "instagram";
    for (const entry of payload.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        const msg = ev.message;
        if (!msg || msg.is_echo || msg.is_deleted) continue; // skip our own echoes
        const text = msg.text ?? (msg.attachments?.length ? `[${msg.attachments[0].type ?? "attachment"}]` : "");
        if (!text) continue;
        out.push({
          type,
          accountId: String(entry.id),
          userId: String(ev.sender?.id),
          text,
          messageId: msg.mid,
          at: ev.timestamp ? new Date(Number(ev.timestamp)) : undefined,
        });
      }
    }
  }
  return out.filter((m) => m.accountId && m.userId);
}

async function graph(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${GRAPH()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Meta API error ${res.status}`);
  return body;
}

export async function sendMeta(channel: Channel, to: string, text: string): Promise<string | null> {
  if (channel.type === "whatsapp") {
    // Free-form text only works inside WhatsApp's 24h customer service window.
    const r = await graph(`/${channel.external_id}/messages`, channel.token, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text } }),
    });
    return r.messages?.[0]?.id ?? null;
  }
  // Messenger and Instagram (via the linked Facebook Page's access token).
  const r = await graph(`/me/messages`, channel.token, {
    method: "POST",
    body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text } }),
  });
  return r.message_id ?? null;
}

/** Best-effort profile name lookup for Messenger / Instagram senders. */
export async function lookupMetaName(channel: Channel, userId: string): Promise<string | null> {
  try {
    const fields = channel.type === "instagram" ? "name,username" : "first_name,last_name";
    const r = await graph(`/${encodeURIComponent(userId)}?fields=${fields}`, channel.token);
    return r.name || r.username || [r.first_name, r.last_name].filter(Boolean).join(" ") || null;
  } catch {
    return null;
  }
}
