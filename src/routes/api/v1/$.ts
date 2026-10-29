import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { api } from "~/api/app";

// Every /api/v1/* request goes to the Hono app (src/api). One process serves the website and the API.
// Behind a reverse proxy (Caddy in production), TRUST_PROXY=true reads the client IP from X-Forwarded-For.
export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      ANY: ({ request }) => api.fetch(request, { ip: getRequestIP({ xForwardedFor: process.env.TRUST_PROXY === "true" }) ?? undefined }),
    },
  },
});
