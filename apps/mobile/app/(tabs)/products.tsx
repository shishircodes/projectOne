import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, call, imageUrl } from "@/api";
import { num, plural, rs } from "@/format";
import { useDebounced } from "@/hooks";
import { keys } from "@/queries";
import { radius, space, type as t, useColors } from "@/theme";
import { Badge, ChipRow, EmptyState, ErrorState, ListRow, Loading, SearchBar, Separator, Text } from "@/ui";

type Filter = "all" | "active" | "draft" | "archived" | "low" | "out";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

export default function Products() {
  const c = useColors();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());

  const list = useInfiniteQuery({
    queryKey: [...keys.products, "list", filter, query],
    queryFn: ({ pageParam }) =>
      call(
        api.products.$get({
          query: {
            q: query || undefined,
            status: filter === "active" || filter === "draft" || filter === "archived" ? filter : undefined,
            stock: filter === "low" || filter === "out" ? filter : undefined,
            page: String(pageParam),
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: space(3), paddingBottom: space(2), gap: space(3), backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ paddingHorizontal: space(4) }}>
          <SearchBar value={q} onChangeText={setQ} placeholder="Name or SKU" />
        </View>
        <ChipRow<Filter> value={filter} onChange={setFilter} options={FILTERS} />
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          ItemSeparatorComponent={() => <Separator inset={space(4) + 52 + space(3)} />}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={c.brand} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            total !== undefined ? (
              <Text variant="small" faint style={{ paddingHorizontal: space(4), paddingVertical: space(2) }}>
                {plural(total, "product")}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={query || filter !== "all" ? "No products match" : "No products yet"}
              body={query || filter !== "all" ? "Try another search or filter." : "Add products on the website, then manage stock and photos here."}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={{ padding: space(4) }} color={c.brand} /> : undefined}
          renderItem={({ item: p }) => {
            const out = p.track_stock && p.stock <= 0;
            const low = p.track_stock && !out && p.stock <= p.low_stock_threshold;
            return (
              <ListRow onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                  <View style={{ width: 52, height: 52, borderRadius: radius.sm, backgroundColor: c.surface2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                    {p.images[0] ? (
                      <Image source={{ uri: imageUrl(p.images[0]) }} style={{ width: 52, height: 52 }} contentFit="cover" transition={150} />
                    ) : (
                      <Ionicons name="image-outline" size={22} color={c.text3} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text numberOfLines={1} style={{ fontWeight: "600" }}>
                      {p.name}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap" }}>
                      <Text variant="small" style={t.number}>
                        {rs(p.price)}
                      </Text>
                      <Text variant="small" faint style={t.number}>
                        {p.track_stock ? `${num(p.stock)} in stock` : "Stock not tracked"}
                      </Text>
                      {out ? <Badge tone="bad">Out of stock</Badge> : low ? <Badge tone="warn">Low</Badge> : null}
                      {p.status !== "active" ? <Badge>{p.status === "draft" ? "Draft" : "Archived"}</Badge> : null}
                    </View>
                  </View>
                </View>
              </ListRow>
            );
          }}
        />
      )}
    </View>
  );
}
