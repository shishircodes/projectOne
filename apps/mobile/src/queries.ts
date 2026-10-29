import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call } from "./api";
import { useSession } from "./session";

/** Query keys, grouped so a change can refresh everything it affects. */
export const keys = {
  counts: ["counts"] as const,
  stats: (days: number) => ["stats", days] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["orders", "detail", id] as const,
  conversations: ["conversations"] as const,
  thread: (id: string) => ["conversations", "thread", id] as const,
  products: ["products"] as const,
  product: (id: string) => ["products", "detail", id] as const,
  stock: (id: string) => ["products", "stock", id] as const,
};

/** Badge numbers (unread chats, orders waiting). Polled while the app is open; push notifications aren't built yet. */
export function useCounts() {
  const { session } = useSession();
  return useQuery({
    queryKey: [...keys.counts, session?.store?.id],
    queryFn: () => call(api.store.counts.$get()),
    refetchInterval: 30_000,
    enabled: !!session?.store,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...groups: readonly (readonly unknown[])[]) => Promise.all(groups.map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })));
}
