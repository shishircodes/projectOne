import { createFileRoute } from "@tanstack/react-router";
import { ingest } from "~/server/channels";
import { parseTikTokWebhook, verifyTikTokSignature } from "~/server/channels/tiktok";

export const Route = createFileRoute("/webhooks/tiktok")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verifyTikTokSignature(raw, request.headers.get("tiktok-signature"))) return new Response("Invalid signature", { status: 401 });
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        for (const m of parseTikTokWebhook(payload)) await ingest(m).catch((e) => console.error("[tiktok webhook]", e));
        return new Response("ok", { status: 200 });
      },
    },
  },
});
