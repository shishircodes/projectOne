// In-process pub/sub feeding the dashboard's Server-Sent Events stream (/api/events).
// Kept on globalThis so Vite's HMR doesn't orphan open streams in development.
// Multiple server instances would fan this out through Postgres LISTEN/NOTIFY or Redis.

export type RealtimeEvent = "message:new" | "order:new" | "order:paid";
type Listener = (event: RealtimeEvent, data: unknown) => void;

const g = globalThis as unknown as { __nsSubscribers?: Map<string, Set<Listener>> };
const subscribers = (g.__nsSubscribers ??= new Map());

export function subscribe(storeId: string, fn: Listener): () => void {
  const key = String(storeId);
  let set = subscribers.get(key);
  if (!set) subscribers.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) subscribers.delete(key);
  };
}

export function publish(storeId: string, event: RealtimeEvent, data: unknown) {
  for (const fn of subscribers.get(String(storeId)) ?? []) {
    try {
      fn(event, data);
    } catch (e) {
      console.error("[realtime]", e);
    }
  }
}
