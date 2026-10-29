import { createFileRoute } from "@tanstack/react-router";
import { ingest } from "~/server/channels";
import { parseMetaWebhook, verifyMetaSignature } from "~/server/channels/meta";

// WhatsApp Cloud API, Messenger and Instagram all arrive through the platform's Meta app.
export const Route = createFileRoute("/webhooks/meta")({
  server: {
    handlers: {
      // Subscription handshake from the Meta app dashboard.
      GET: ({ request }) => {
        const p = new URL(request.url).searchParams;
        const expected = process.env.META_VERIFY_TOKEN;
        if (expected && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) {
          return new Response(p.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        for (const m of parseMetaWebhook(payload)) await ingest(m).catch((e) => console.error("[meta webhook]", e));
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
