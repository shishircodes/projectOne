import { createFileRoute } from "@tanstack/react-router";
import { storeForHost } from "~/server/services/stores";

// Caddy asks here before getting an HTTPS certificate on demand (on_demand_tls "ask"), so certificates are only issued
// for hosts we actually serve: the platform itself, <slug>.BASE_DOMAIN and stores' custom domains.
// Answers 200 (yes) or 404 (no). It reveals nothing a visitor couldn't learn by opening the domain.
const platformHosts = () => {
  const hosts = new Set<string>();
  try {
    const h = new URL(process.env.PUBLIC_URL ?? "").hostname.toLowerCase();
    if (h) hosts.add(h).add(`www.${h}`);
  } catch {}
  const base = (process.env.BASE_DOMAIN ?? "").toLowerCase();
  if (base) hosts.add(base).add(`www.${base}`);
  return hosts;
};

export const Route = createFileRoute("/internal/tls-allowed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const domain = (new URL(request.url).searchParams.get("domain") ?? "").toLowerCase().trim();
        if (!domain || domain.length > 253) return new Response("no", { status: 404 });
        const ok = platformHosts().has(domain) || !!(await storeForHost(domain));
        return new Response(ok ? "ok" : "no", { status: ok ? 200 : 404 });
      },
    },
  },
});
