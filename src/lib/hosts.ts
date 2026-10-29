// Host-based storefront routing, shared by the router's URL rewrite on server and client.
// Platform hosts serve the app; <slug>.BASE_DOMAIN and custom domains serve one store at "/".

declare const __PLATFORM_HOST__: string;
declare const __BASE_DOMAIN__: string;

const PLATFORM = new Set(["localhost", "127.0.0.1", "[::1]", __PLATFORM_HOST__].filter(Boolean));
const BASE = __BASE_DOMAIN__;

/** Paths that are never storefront pages (server routes, server functions, assets). */
const PASSTHROUGH = /^\/(_|api\/|internal\/|uploads\/|payments\/|webhooks\/|healthz|privacy|data-deletion|assets\/|@|node_modules\/|src\/)/;

/** "/s/<slug>" (subdomain), "/s/_host" (custom domain), or null for the platform itself. */
export function storePrefixFor(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (PLATFORM.has(host) || (BASE && (host === BASE || host === `www.${BASE}`))) return null;
  if (BASE && host.endsWith(`.${BASE}`)) {
    const slug = host.slice(0, -(BASE.length + 1));
    return slug && !slug.includes(".") ? `/s/${slug}` : null;
  }
  return "/s/_host";
}

export const rewrite = {
  input: ({ url }: { url: URL }) => {
    const prefix = storePrefixFor(url.hostname);
    if (!prefix || url.pathname.startsWith("/s/") || PASSTHROUGH.test(url.pathname)) return undefined;
    url.pathname = prefix + (url.pathname === "/" ? "" : url.pathname);
    return url;
  },
  output: ({ url }: { url: URL }) => {
    const prefix = storePrefixFor(url.hostname);
    if (!prefix || !url.pathname.startsWith(prefix)) return undefined;
    url.pathname = url.pathname.slice(prefix.length) || "/";
    return url;
  },
};
