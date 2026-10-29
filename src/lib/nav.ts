import { redirect } from "@tanstack/react-router";
import type { Feature } from "./features";

/** Dashboard pages and the feature each one needs (null = always available). */
export const PAGES = [
  { to: "/app", label: "Overview", feature: "analytics" },
  { to: "/app/orders", label: "Orders", feature: "orders" },
  { to: "/app/inbox", label: "Inbox", feature: "inbox" },
  { to: "/app/products", label: "Products", feature: "products" },
  { to: "/app/categories", label: "Categories", feature: "products" },
  { to: "/app/channels", label: "Channels", feature: "channels" },
  { to: "/app/settings", label: "Settings", feature: null },
] as const satisfies readonly { to: string; label: string; feature: Feature | null }[];

export type PagePath = (typeof PAGES)[number]["to"];

export const canSee = (features: Feature[], feature: Feature | null) => feature === null || features.includes(feature);

/** Where a user lands in the dashboard: the first page they have access to. */
export function homePath(features: Feature[]): PagePath {
  return PAGES.find((p) => canSee(features, p.feature))?.to ?? "/app/settings";
}

/** Route guard: send people without the feature to a page they can use. */
export function requireFeature(session: { user: { features: Feature[] } }, feature: Feature) {
  if (!session.user.features.includes(feature)) throw redirect({ to: homePath(session.user.features) });
}
