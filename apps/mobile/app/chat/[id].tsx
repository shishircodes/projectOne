import { useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "expo-router/react-navigation";
import { api, call, type Data } from "@/api";
import { channelLabel, dateTime, rs, timeOnly } from "@/format";
import { keys, useInvalidate } from "@/queries";
import { useStoreSession } from "@/session";
import { radius, space, useColors } from "@/theme";
import { Badge, ErrorState, Loading, OrderStatusBadge, Text } from "@/ui";

type Thread = Data<(typeof api.conversations)[":id"]["$get"]>;
type Message = Thread["messages"][number];

export default function Chat() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { has } = useStoreSession();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");

  // Opening the thread marks it read on the server, so refresh the badges after the first load.
  const thread = useQuery({ queryKey: keys.thread(id), queryFn: () => call(api.conversations[":id"].$get({ param: { id } })), refetchInterval: 5_000 });
  const loaded = !!thread.data;
  useEffect(() => {
    if (loaded) void invalidate(keys.counts, [...keys.conversations, "list"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const send = useMutation({
    mutationFn: (body: string) => call(api.conversations[":id"].replies.$post({ param: { id }, json: { text: body } })),
    onSuccess: (m) => {
      qc.setQueryData<Thread>(keys.thread(id), (t) => (t ? { ...t, messages: [...t.messages, m] } : t));
      setText("");
      void invalidate([...keys.conversations, "list"]);
    },
  });

  if (thread.isPending) return <Loading />;
  if (thread.isError) return <ErrorState error={thread.error} onRetry={() => thread.refetch()} />;
  const { conversation: cv, messages, orders } = thread.data;
  const title = cv.customer_name || name || cv.external_user_id;
  const newestFirst = [...messages].reverse();

  return (
    <>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(4), paddingVertical: space(2), backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text variant="small" muted>
            {channelLabel(cv.channel)} · {cv.external_user_id}
          </Text>
        </View>
        {orders.length && has("orders") ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space(2), padding: space(3) }}>
            {orders.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })}
                style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) }}
              >
                <Text variant="small" style={{ fontWeight: "600" }}>
                  #{o.order_number}
                </Text>
                <Text variant="small" muted>
                  {rs(o.total)}
                </Text>
                <OrderStatusBadge status={o.status} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <FlatList
          inverted
          data={newestFirst}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space(3), gap: space(2) }}
          renderItem={({ item }) => <Bubble m={item} />}
          ListEmptyComponent={
            <Text faint style={{ textAlign: "center", padding: space(6), transform: [{ scaleY: -1 }] }}>
              No messages yet.
            </Text>
          }
        />
        {send.isError ? (
          <Text variant="small" style={{ color: c.bad, paddingHorizontal: space(4), paddingBottom: space(1) }}>
            {send.error.message}
          </Text>
        ) : null}
        {cv.channel === "whatsapp" ? (
          <Text variant="tiny" faint style={{ paddingHorizontal: space(4), paddingBottom: space(1) }}>
            WhatsApp only delivers replies within 24 hours of the customer's last message.
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: space(2),
            paddingHorizontal: space(3),
            paddingTop: space(2),
            paddingBottom: Math.max(insets.bottom, space(2)),
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderTopColor: c.border,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a reply"
            placeholderTextColor={c.text3}
            multiline
            style={{ flex: 1, maxHeight: 120, minHeight: 42, fontSize: 16, color: c.text, backgroundColor: c.surface2, borderRadius: radius.lg, paddingHorizontal: space(3), paddingTop: 11, paddingBottom: 11 }}
          />
          <Pressable
            onPress={() => text.trim() && !send.isPending && send.mutate(text.trim())}
            disabled={!text.trim() || send.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send reply"
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: c.brand,
              alignItems: "center",
              justifyContent: "center",
              opacity: !text.trim() || send.isPending ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Ionicons name="send" size={18} color={c.brandInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function Bubble({ m }: { m: Message }) {
  const c = useColors();
  const out = m.direction === "out";
  return (
    <View style={{ alignItems: out ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "82%",
          backgroundColor: out ? c.brand : c.surface,
          borderColor: out ? c.brand : c.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          borderBottomRightRadius: out ? 4 : radius.lg,
          borderBottomLeftRadius: out ? radius.lg : 4,
          paddingHorizontal: space(3),
          paddingVertical: space(2),
        }}
      >
        <Text style={{ color: out ? c.brandInk : c.text }}>{m.body}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(1.5), marginTop: 3 }}>
        <Text variant="tiny" faint accessibilityLabel={dateTime(m.created_at)}>
          {timeOnly(m.created_at)}
        </Text>
        {m.status === "failed" ? <Badge tone="bad">Not sent</Badge> : m.status === "test" ? <Badge>Test</Badge> : null}
      </View>
      {m.status === "failed" && m.error ? (
        <Text variant="tiny" style={{ color: c.bad, maxWidth: "82%", textAlign: out ? "right" : "left" }}>
          {m.error}
        </Text>
      ) : null}
    </View>
  );
}
