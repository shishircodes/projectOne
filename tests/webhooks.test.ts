import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { parseMetaWebhook, verifyMetaSignature } from "../src/server/channels/meta";
import { parseTikTokWebhook, verifyTikTokSignature } from "../src/server/channels/tiktok";

describe("Meta webhook", () => {
  test("verifies X-Hub-Signature-256", () => {
    process.env.META_APP_SECRET = "s3cret";
    const raw = JSON.stringify({ object: "page" });
    const sig = "sha256=" + createHmac("sha256", "s3cret").update(raw).digest("hex");
    expect(verifyMetaSignature(raw, sig)).toBe(true);
    expect(verifyMetaSignature(raw + " ", sig)).toBe(false);
    expect(verifyMetaSignature(raw, null)).toBe(false);
    expect(verifyMetaSignature(raw, "sha256=00")).toBe(false);
  });

  test("parses WhatsApp text and media messages", () => {
    const msgs = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "PNID" },
        contacts: [{ wa_id: "9779841000000", profile: { name: "Sita" } }],
        messages: [
          { from: "9779841000000", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Namaste" } },
          { from: "9779841000000", id: "wamid.2", timestamp: "1700000001", type: "image", image: { caption: "this one" } },
        ],
      } }] }],
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ type: "whatsapp", accountId: "PNID", userId: "9779841000000", userName: "Sita", text: "Namaste", messageId: "wamid.1" });
    expect(msgs[1].text).toBe("[image] this one");
  });

  test("ignores WhatsApp status updates", () => {
    const msgs = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, statuses: [{ id: "x", status: "read" }] } }] }],
    });
    expect(msgs).toHaveLength(0);
  });

  test("parses Messenger and Instagram, skipping echoes", () => {
    const page = parseMetaWebhook({
      object: "page",
      entry: [{ id: "PAGE1", messaging: [
        { sender: { id: "PSID" }, timestamp: 1700000000000, message: { mid: "m1", text: "Price?" } },
        { sender: { id: "PAGE1" }, timestamp: 1700000000001, message: { mid: "m2", text: "Rs 900", is_echo: true } },
      ] }],
    });
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({ type: "messenger", accountId: "PAGE1", userId: "PSID", text: "Price?" });

    const ig = parseMetaWebhook({
      object: "instagram",
      entry: [{ id: "IG1", messaging: [{ sender: { id: "IGSID" }, message: { mid: "m3", attachments: [{ type: "image" }] } }] }],
    });
    expect(ig[0]).toMatchObject({ type: "instagram", accountId: "IG1", text: "[image]" });
  });
});

describe("TikTok webhook", () => {
  test("verifies TikTok-Signature with timestamp", () => {
    process.env.TIKTOK_CLIENT_SECRET = "tt";
    const raw = '{"a":1}';
    const t = Math.floor(Date.now() / 1000);
    const s = createHmac("sha256", "tt").update(`${t}.${raw}`).digest("hex");
    expect(verifyTikTokSignature(raw, `t=${t},s=${s}`)).toBe(true);
    expect(verifyTikTokSignature(raw, `t=${t - 1000},s=${s}`)).toBe(false); // stale / wrong
    expect(verifyTikTokSignature(raw, null)).toBe(false);
  });

  test("parses message content given as a JSON string", () => {
    const msgs = parseTikTokWebhook({
      user_openid: "BIZ",
      content: JSON.stringify({ conversation_id: "CONV1", message_id: "mid", text: { body: "Is it in stock?" } }),
    });
    expect(msgs[0]).toMatchObject({ type: "tiktok", accountId: "BIZ", userId: "CONV1", text: "Is it in stock?" });
  });
});
