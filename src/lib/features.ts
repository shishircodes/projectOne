// The app's main features. Admins assign them per user; the server enforces them on every request.
// Store settings (name, address, contact, delivery fees) are always available to a store owner.

export const FEATURES = [
  { key: "analytics", label: "Sales analytics", description: "Overview page: revenue, profit, best sellers, charts and alerts." },
  { key: "products", label: "Products & stock", description: "Products, categories, photos and stock tracking." },
  { key: "orders", label: "Orders", description: "Order list and status, manual orders from chats and phone calls." },
  { key: "inbox", label: "Inbox", description: "One inbox for customer messages, replies, and turning chats into orders." },
  { key: "channels", label: "Messaging channels", description: "Connect WhatsApp, Messenger, Instagram and TikTok accounts. Needs Inbox." },
  { key: "storefront", label: "Online store", description: "Publish a website with cart and checkout, and use a custom domain." },
  { key: "online_payments", label: "Online payments", description: "Take eSewa and Khalti payments at checkout. Needs Online store." },
] as const;

export type Feature = (typeof FEATURES)[number]["key"];
export const ALL_FEATURES: Feature[] = FEATURES.map((f) => f.key);
export const isFeature = (v: unknown): v is Feature => typeof v === "string" && (ALL_FEATURES as string[]).includes(v);

/** Features that only make sense together with another one. */
export const REQUIRES: Partial<Record<Feature, Feature>> = { channels: "inbox", online_payments: "storefront" };

/** Drop unknown keys and anything whose prerequisite is missing. */
export function normalizeFeatures(input: unknown): Feature[] {
  const set = new Set((Array.isArray(input) ? input : []).filter(isFeature));
  for (const [f, needs] of Object.entries(REQUIRES)) if (set.has(f as Feature) && !set.has(needs!)) set.delete(f as Feature);
  return ALL_FEATURES.filter((f) => set.has(f));
}
