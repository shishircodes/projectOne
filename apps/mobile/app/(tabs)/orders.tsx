import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, call } from "@/api";
import { relative, rs, cap, plural } from "@/format";
import { useDebounced } from "@/hooks";
import { keys } from "@/queries";
import { space, type as t, useColors } from "@/theme";
import { ChannelTag, ChipRow, EmptyState, ErrorState, ListRow, Loading, OrderStatusBadge, SearchBar, Separator, Text } from "@/ui";

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"] as const;
type Filter = "all" | (typeof STATUSES)[number];

export default function Orders() {
  const c = useColors();
  const params = useLocalSearchParams<{ status?: string }>();
  const fromLink = (STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as Filter) : null;
  const [status, setStatus] = useState<Filter>(fromLink ?? "all");
  // Overview links here with ?status=pending; the tab may already be open, so follow the link when it changes.
  useEffect(() => {
    if (fromLink) setStatus(fromLink);
  }, [fromLink]);
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());

  const list = useInfiniteQuery({
    queryKey: [...keys.orders, "list", status, query],
    queryFn: ({ pageParam }) =>
      call(api.orders.$get({ query: { status: status === "all" ? undefined : status, q: query || undefined, page: String(pageParam) } })),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

  const first = list.data?.pages[0];
  const counts = first?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: space(3), paddingBottom: space(2), gap: space(3), backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ paddingHorizontal: space(4) }}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Name, phone or order number" />
        </View>
        <ChipRow<Filter>
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "All", count: first ? all : undefined }, ...STATUSES.map((s) => ({ value: s, label: cap(s), count: first ? (counts[s] ?? 0) : undefined }))]}
        />
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          ItemSeparatorComponent={() => <Separator />}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={c.brand} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            first ? (
              <Text variant="small" faint style={{ paddingHorizontal: space(4), paddingVertical: space(2) }}>
                {plural(first.total, "order")}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={query ? "No orders match" : status === "all" ? "No orders yet" : `No ${status} orders`}
              body={query ? "Try a name, phone number or order number." : "Orders from your website and chats show up here."}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={{ padding: space(4) }} color={c.brand} /> : undefined}
          renderItem={({ item: o }) => (
            <ListRow onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(2) }}>
                <Text numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
                  #{o.order_number} · {o.customer_name}
                </Text>
                <Text style={[t.number, { fontWeight: "600" }]}>{rs(o.total)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(1.5) }}>
                <OrderStatusBadge status={o.status} />
                <ChannelTag channel={o.source} />
                <Text variant="tiny" faint style={{ marginLeft: "auto" }}>
                  {plural(o.item_count, "item")} · {relative(o.created_at)}
                </Text>
              </View>
            </ListRow>
          )}
        />
      )}
    </View>
  );
}
