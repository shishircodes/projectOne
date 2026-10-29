import { useSyncExternalStore } from "react";

// Per-store cart in localStorage ({ productId: quantity }), shared across tabs.
type Cart = Record<string, number>;
const listeners = new Set<() => void>();
const key = (slug: string) => `cart:${slug}`;
const cache = new Map<string, { raw: string | null; cart: Cart }>();

function read(slug: string): Cart {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(slug));
  } catch {}
  const hit = cache.get(slug);
  if (hit && hit.raw === raw) return hit.cart; // stable reference for useSyncExternalStore
  let cart: Cart = {};
  try {
    cart = raw ? JSON.parse(raw) : {};
  } catch {}
  cache.set(slug, { raw, cart });
  return cart;
}

function write(slug: string, cart: Cart) {
  try {
    localStorage.setItem(key(slug), JSON.stringify(cart));
  } catch {}
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => e.key?.startsWith("cart:") && listeners.forEach((l) => l()));
}

const EMPTY: Cart = {};
export function useCart(slug: string) {
  const cart = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => read(slug),
    () => EMPTY,
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  return {
    cart,
    count,
    add: (id: string, qty = 1, max = 99) => write(slug, { ...read(slug), [id]: Math.min((read(slug)[id] ?? 0) + qty, max) }),
    set: (id: string, qty: number) => {
      const next = { ...read(slug) };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      write(slug, next);
    },
    prune: (validIds: string[]) => {
      const next = Object.fromEntries(Object.entries(read(slug)).filter(([id]) => validIds.includes(id)));
      if (Object.keys(next).length !== Object.keys(read(slug)).length) write(slug, next);
    },
    clear: () => write(slug, {}),
  };
}
