import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api, call } from "@/api";
import { cap, dateTime, rs } from "@/format";
import { keys, useInvalidate } from "@/queries";
import { useStoreSession } from "@/session";
import { space, type as t, useColors } from "@/theme";
import { Badge, Button, Card, ChannelTag, ErrorState, KeyValue, Loading, OrderStatusBadge, PaymentBadge, SectionTitle, Separator, Text } from "@/ui";

type Status = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned";
const FINAL: Status[] = ["cancelled", "returned"];

/** The usual next step for each status, shown as the main button. */
const NEXT: Partial<Record<Status, { to: Status; label: string }>> = {
  pending: { to: "confirmed", label: "Confirm order" },
  confirmed: { to: "shipped", label: "Mark as shipped" },
  shipped: { to: "delivered", label: "Mark as delivered" },
};

/** Ask before anything that can't be undone (cancel/return put stock back and lock the order). */
function confirmAsk(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Keep order", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function OrderDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { has } = useStoreSession();
  const invalidate = useInvalidate();
  const order = useQuery({ queryKey: keys.order(id), queryFn: () => call(api.orders[":id"].$get({ param: { id } })) });

  const update = useMutation({
    mutationFn: (json: { status?: Status; payment_status?: "unpaid" | "paid" | "refunded" }) => call(api.orders[":id"].$patch({ param: { id }, json })),
    onSuccess: () => invalidate(keys.orders, keys.counts, ["stats"], keys.products),
    onError: (e) => (Platform.OS === "web" ? window.alert(e.message) : Alert.alert("Couldn't update the order", e.message)),
  });

  if (order.isPending) return <Loading />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data;
  const status = o.status as Status;
  const next = NEXT[status];
  const final = FINAL.includes(status);

  async function setStatus(to: Status) {
    if (FINAL.includes(to)) {
      const ok = await confirmAsk(
        to === "cancelled" ? `Cancel order #${o.order_number}?` : `Mark order #${o.order_number} as returned?`,
        "Tracked stock goes back on the shelf, and the order can't change status after this.",
        to === "cancelled" ? "Cancel order" : "Mark returned",
      );
      if (!ok) return;
    }
    update.mutate({ status: to });
  }

  const phone = o.customer_phone;
  const address = [o.address, o.city, o.province].filter(Boolean).join(", ");

  return (
    <>
      <Stack.Screen options={{ title: `Order #${o.order_number}` }} />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: space(4), paddingBottom: space(10) }}
        refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => void order.refetch()} tintColor={c.brand} />}
      >
        <Card style={{ gap: space(3) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap" }}>
            <OrderStatusBadge status={o.status} />
            <PaymentBadge status={o.payment_status} />
            <Badge>{o.payment_method.toUpperCase()}</Badge>
            <View style={{ marginLeft: "auto" }}>
              <ChannelTag channel={o.source} />
            </View>
          </View>
          <Text style={[t.number, { fontSize: 28, fontWeight: "700" }]}>{rs(o.total)}</Text>
          <Text variant="small" faint>
            Placed {dateTime(o.created_at)}
          </Text>
          {next && !final ? <Button title={next.label} onPress={() => setStatus(next.to)} loading={update.isPending && update.variables?.status === next.to} /> : null}
          {o.payment_status !== "paid" && !final ? (
            <Button
              title="Mark as paid"
              variant="secondary"
              icon="cash-outline"
              onPress={() => update.mutate({ payment_status: "paid" })}
              loading={update.isPending && update.variables?.payment_status === "paid"}
            />
          ) : null}
        </Card>

        <SectionTitle>Status</SectionTitle>
        <Card style={{ gap: space(2) }}>
          {final ? (
            <Text muted>This order is {status}. Its status can't change any more.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
              {(["pending", "confirmed", "shipped", "delivered"] as Status[]).map((s) => (
                <Button key={s} small title={cap(s)} variant={s === status ? "primary" : "secondary"} onPress={() => s !== status && setStatus(s)} disabled={update.isPending} />
              ))}
            </View>
          )}
          {!final ? (
            <View style={{ flexDirection: "row", gap: space(2), marginTop: space(1) }}>
              <Button small title="Cancel order" variant="danger" onPress={() => setStatus("cancelled")} disabled={update.isPending} />
              {status === "delivered" || status === "shipped" ? (
                <Button small title="Mark returned" variant="danger" onPress={() => setStatus("returned")} disabled={update.isPending} />
              ) : null}
            </View>
          ) : null}
          {o.payment_status === "paid" && !final ? (
            <Button small title="Mark as unpaid" variant="ghost" onPress={() => update.mutate({ payment_status: "unpaid" })} style={{ alignSelf: "flex-start" }} />
          ) : null}
        </Card>

        <SectionTitle>Customer</SectionTitle>
        <Card style={{ gap: space(2) }}>
          <Text style={{ fontWeight: "600" }}>{o.customer_name}</Text>
          {phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={{ flexDirection: "row", alignItems: "center", gap: space(2) }} accessibilityRole="link">
              <Ionicons name="call-outline" size={16} color={c.link} />
              <Text style={{ color: c.link }}>{phone}</Text>
            </Pressable>
          ) : null}
          {o.customer_email ? <Text muted>{o.customer_email}</Text> : null}
          {address ? <Text muted>{address}</Text> : null}
          <Text variant="small" faint>
            {o.inside_valley ? "Inside Kathmandu Valley" : "Outside Kathmandu Valley"}
          </Text>
          {o.note ? (
            <View style={{ backgroundColor: c.surface2, borderRadius: 8, padding: space(3) }}>
              <Text variant="small">{o.note}</Text>
            </View>
          ) : null}
          {o.conversation_id && has("inbox") ? (
            <Button small variant="secondary" icon="chatbubbles-outline" title="Open chat" onPress={() => router.push({ pathname: "/chat/[id]", params: { id: o.conversation_id! } })} style={{ alignSelf: "flex-start" }} />
          ) : null}
        </Card>

        <SectionTitle>Items</SectionTitle>
        <Card padded={false}>
          {o.items.map((it, i) => (
            <View key={it.id}>
              {i > 0 ? <Separator /> : null}
              <View style={{ flexDirection: "row", gap: space(3), padding: space(4) }}>
                <View style={{ flex: 1 }}>
                  <Text>{it.name}</Text>
                  <Text variant="small" faint style={t.number}>
                    {it.quantity} × {rs(it.price)}
                  </Text>
                </View>
                <Text style={t.number}>{rs(it.price * it.quantity)}</Text>
              </View>
            </View>
          ))}
          <Separator inset={0} />
          <View style={{ padding: space(4) }}>
            <KeyValue label="Subtotal" value={rs(o.subtotal)} />
            <KeyValue label="Delivery" value={rs(o.delivery_fee)} />
            {o.discount ? <KeyValue label="Discount" value={`− ${rs(o.discount)}`} /> : null}
            <KeyValue label="Total" value={rs(o.total)} strong />
          </View>
        </Card>

        {o.payments.length ? (
          <>
            <SectionTitle>Online payments</SectionTitle>
            <Card padded={false}>
              {o.payments.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Separator /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4) }}>
                    <View style={{ flex: 1 }}>
                      <Text>
                        {cap(p.provider)} {p.mode === "test" ? "(test)" : ""}
                      </Text>
                      <Text variant="small" faint>
                        {dateTime(p.created_at)}
                      </Text>
                    </View>
                    <Text style={t.number}>{rs(p.amount)}</Text>
                    <Badge tone={p.status === "completed" ? "good" : p.status === "failed" || p.status === "mismatch" ? "bad" : p.status === "pending" ? "warn" : "neutral"}>
                      {cap(p.status)}
                    </Badge>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
