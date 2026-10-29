import { createFileRoute } from "@tanstack/react-router";
import { sql } from "~/server/db";

// Load balancer / deploy check: the app is up and can reach Postgres.
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await Promise.race([sql`SELECT 1`, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 3000))]);
          return new Response("ok");
        } catch {
          return new Response("database unavailable", { status: 503 });
        }
      },
    },
  },
});
