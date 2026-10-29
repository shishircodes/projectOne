import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api, call, type Data } from "@/api";
import { cap, channelLabel, CHANNELS, num, percentChange, plural, rs, rsShort } from "@/format";
import { keys, useCounts } from "@/queries";
import { useStoreSession } from "@/session";
import { radius, space, type as t, useColors } from "@/theme";
import { Card, ChipRow, ErrorState, Loading, SectionTitle, Separator, Text, type IconName } from "@/ui";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
] as const;
type Range = (typeof RANGES)[number]["value"];

/** GET store/stats (needs Sales analytics) and GET store/counts. */
export default function Overview() {
  const c = useColors();
  const { has } = useStoreSession();
  const [range, setRange] = useState<Range>("30");
  const days = Number(range);
  const stats = useQuery({ queryKey: keys.stats(days), queryFn: () => call(api.store.stats.$get({ query: { days: range } })) });
  const counts = useCounts();

  const refresh = () => void Promise.all([stats.refetch(), counts.refetch()]);

  return (
    <ScrollView
      contentContainerStyle={{ paddingVertical: space(3), paddingBottom: space(10) }}
      refreshControl={<RefreshControl refreshing={stats.isRefetching} onRefresh={refresh} tintColor={c.brand} />}
    >
      <ChipRow<Range> value={range} onChange={setRange} options={[...RANGES]} />
      <View style={{ paddingHorizontal: space(4) }}>
        {/* Needs attention: from store/counts, filtered by the server to the seller's features. */}
        {counts.data && (counts.data.pending > 0 || counts.data.unread > 0) ? (
          <View style={{ flexDirection: "row", gap: space(3), marginTop: space(4) }}>
            {has("orders") ? (
              <Attention icon="receipt-outline" n={counts.data.pending} label={counts.data.pending === 1 ? "order to confirm" : "orders to confirm"} onPress={() => router.push({ pathname: "/orders", params: { status: "pending" } })} />
            ) : null}
            {has("inbox") ? <Attention icon="chatbubbles-outline" n={counts.data.unread} label="unread messages" onPress={() => router.push("/inbox")} /> : null}
          </View>
        ) : null}

        {stats.isPending ? (
          <View style={{ height: 300 }}>
            <Loading />
          </View>
        ) : stats.isError ? (
          <ErrorState error={stats.error} onRetry={refresh} />
        ) : (
          <StatsBody s={stats.data} />
        )}
      </View>
    </ScrollView>
  );
}

type Stats = Data<typeof api.store.stats.$get>;

function StatsBody({ s }: { s: Stats }) {
  const c = useColors();
  const { has } = useStoreSession();
  const k = s.kpi;
  const maxDay = Math.max(1, ...s.daily.map((d) => d.revenue));
  const period = s.days === 365 ? "12 months" : `${s.days} days`;

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3), marginTop: space(4) }}>
        <Kpi label="Revenue" value={rsShort(k.revenue)} change={percentChange(k.revenue, k.prev_revenue)} />
        <Kpi label="Orders" value={num(k.orders)} change={percentChange(k.orders, k.prev_orders)} />
        <Kpi label="Avg. order" value={rsShort(k.aov)} />
        <Kpi label="Gross profit" value={rsShort(k.gross_profit)} />
        <Kpi label="Collected" value={rsShort(k.collected)} hint="Marked paid" />
        <Kpi label="Customers" value={num(k.customers)} />
      </View>

      <SectionTitle>Revenue by day</SectionTitle>
      <Card>
        <View style={{ height: 120, flexDirection: "row", alignItems: "flex-end", gap: s.daily.length > 60 ? 0 : 2 }} accessibilityLabel={`Daily revenue over the last ${period}`}>
          {s.daily.map((d) => (
            <View key={d.day} style={{ flex: 1, height: `${Math.max(2, (d.revenue / maxDay) * 100)}%`, backgroundColor: d.revenue ? c.brand : c.surface3, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space(2) }}>
          <Text variant="tiny" faint>
            {s.daily[0]?.day.slice(5)}
          </Text>
          <Text variant="tiny" faint>
            Best day {rs(maxDay === 1 ? 0 : maxDay)}
          </Text>
          <Text variant="tiny" faint>
            Today
          </Text>
        </View>
      </Card>

      <SectionTitle>Stock</SectionTitle>
      <Card style={{ gap: space(1) }}>
        <Row label="Products" value={num(k.products)} />
        <Row label="Stock value" value={rs(k.stock_value)} />
        <Row label="Out of stock" value={num(k.out_of_stock)} tone={k.out_of_stock ? "bad" : undefined} />
      </Card>

      {s.lowStock.length ? (
        <>
          <SectionTitle>Running low</SectionTitle>
          <Card padded={false}>
            {s.lowStock.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Separator /> : null}
                <Pressable
                  disabled={!has("products")}
                  onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id } })}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: space(4), gap: space(3), backgroundColor: pressed ? c.surface2 : "transparent" })}
                >
                  <Text style={{ flex: 1 }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[t.number, { color: p.stock <= 0 ? c.bad : c.warn, fontWeight: "600" }]}>{p.stock <= 0 ? "Out" : `${num(p.stock)} left`}</Text>
                  {has("products") ? <Ionicons name="chevron-forward" size={16} color={c.text3} /> : null}
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {s.topProducts.length ? (
        <>
          <SectionTitle>Best sellers</SectionTitle>
          <Card padded={false}>
            {s.topProducts.map((p, i) => (
              <View key={p.name}>
                {i > 0 ? <Separator /> : null}
                <View style={{ flexDirection: "row", alignItems: "center", padding: space(4), gap: space(3) }}>
                  <Text faint style={[t.number, { width: 18 }]}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{p.name}</Text>
                    <Text variant="small" faint>
                      {plural(p.units, "unit")} sold
                    </Text>
                  </View>
                  <Text style={t.number}>{rsShort(p.revenue)}</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {s.bySource.length ? (
        <>
          <SectionTitle>By channel</SectionTitle>
          <Card style={{ gap: space(3) }}>
            {s.bySource.map((x) => {
              const share = k.revenue ? x.revenue / k.revenue : 0;
              return (
                <View key={x.source} style={{ gap: space(1) }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text>{channelLabel(x.source)}</Text>
                    <Text style={t.number} muted>
                      {plural(x.orders, "order")} · {rsShort(x.revenue)}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surface2, overflow: "hidden" }}>
                    <View style={{ width: `${Math.round(share * 100)}%`, height: 6, backgroundColor: CHANNELS[x.source]?.color ?? c.brand }} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {s.byStatus.length ? (
        <>
          <SectionTitle>Order status</SectionTitle>
          <Card style={{ gap: space(1) }}>
            {s.byStatus.map((x) => (
              <Row key={x.status} label={cap(x.status)} value={num(x.orders)} />
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function Kpi({ label, value, change, hint }: { label: string; value: string; change?: number | null; hint?: string }) {
  const c = useColors();
  const up = (change ?? 0) >= 0;
  return (
    <Card style={{ flexBasis: "47%", flexGrow: 1, gap: space(1) }}>
      <Text variant="small" muted>
        {label}
      </Text>
      <Text style={[t.number, { fontSize: 22, fontWeight: "700" }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {change !== undefined && change !== null ? (
        <Text variant="tiny" style={{ color: up ? c.good : c.bad, fontWeight: "600" }}>
          {up ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs previous
        </Text>
      ) : hint ? (
        <Text variant="tiny" faint>
          {hint}
        </Text>
      ) : change === null ? (
        <Text variant="tiny" faint>
          No earlier data
        </Text>
      ) : null}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space(1) }}>
      <Text muted>{label}</Text>
      <Text style={[t.number, { fontWeight: "600" }, tone === "bad" && { color: c.bad }]}>{value}</Text>
    </View>
  );
}

function Attention({ icon, n, label, onPress }: { icon: IconName; n: number; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        padding: space(3),
        borderRadius: radius.lg,
        backgroundColor: c.brandSoft,
        borderWidth: 1,
        borderColor: c.brand6,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Ionicons name={icon} size={22} color={c.brandText} />
      <View style={{ flex: 1 }}>
        <Text style={[t.number, { fontSize: 20, fontWeight: "700", color: c.brandText }]}>{num(n)}</Text>
        <Text variant="tiny" style={{ color: c.brandText }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
