import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, call } from "@/api";
import { relative } from "@/format";
import { keys } from "@/queries";
import { space, useColors } from "@/theme";
import { Avatar, ChannelTag, ChipRow, CountBadge, EmptyState, ErrorState, ListRow, Loading, Separator, Text } from "@/ui";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export default function Inbox() {
  const c = useColors();
  const [channel, setChannel] = useState<Filter>("all");
  const list = useQuery({
    queryKey: [...keys.conversations, "list", channel],
    queryFn: () => call(api.conversations.$get({ query: { channel: channel === "all" ? undefined : channel } })),
    refetchInterval: 15_000, // live updates come over SSE on the website; the app polls while open
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingVertical: space(3), backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <ChipRow<Filter> value={channel} onChange={setChannel} options={[...FILTERS]} />
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(x) => x.id}
          ItemSeparatorComponent={() => <Separator inset={space(4) + 44 + space(3)} />}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={c.brand} />}
          ListEmptyComponent={
            <EmptyState icon="chatbubbles-outline" title="No conversations yet" body="Messages from WhatsApp, Messenger, Instagram and TikTok show up here once a channel is connected on the website." />
          }
          renderItem={({ item: cv }) => {
            const name = cv.customer_name || cv.external_user_id;
            const unread = cv.unread > 0;
            return (
              <ListRow chevron={false} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: cv.id, name } })}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                  <Avatar name={name} size={44} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                      <Text numberOfLines={1} style={{ flex: 1, fontWeight: unread ? "700" : "600" }}>
                        {name}
                      </Text>
                      <Text variant="tiny" faint>
                        {relative(cv.last_message_at)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                      <Text numberOfLines={1} variant="small" muted={!unread} style={{ flex: 1, fontWeight: unread ? "600" : "400" }}>
                        {cv.last_message ?? ""}
                      </Text>
                      <CountBadge n={cv.unread} />
                    </View>
                    <ChannelTag channel={cv.channel} />
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
