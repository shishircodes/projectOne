import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useStoreSession, type Feature } from "@/session";
import { space, useColors } from "@/theme";
import { Avatar, Button, Card, ListRow, SectionTitle, Separator, Text } from "@/ui";

const FEATURE_LABELS: Record<Feature, string> = {
  analytics: "Sales analytics",
  products: "Products & stock",
  orders: "Orders",
  inbox: "Inbox",
  channels: "Messaging channels",
  storefront: "Online store",
  online_payments: "Online payments",
};

export default function Account() {
  const c = useColors();
  const { session, server, signOut } = useStoreSession();
  const [busy, setBusy] = useState(false);
  const { user, store, stores } = session;

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(10) }}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <Avatar name={user.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="heading">{user.name}</Text>
          <Text muted>{user.email}</Text>
        </View>
      </Card>

      <SectionTitle>Store</SectionTitle>
      <Card padded={false} style={{ overflow: "hidden" }}>
        <ListRow chevron={false}>
          <Text style={{ fontWeight: "600" }}>{store.name}</Text>
          <Text variant="small" faint>
            {store.published ? "Published" : "Not published"} · /s/{store.slug}
          </Text>
        </ListRow>
        {stores.length > 1 ? (
          <>
            <Separator />
            <ListRow onPress={() => router.push("/stores")}>
              <Text style={{ color: c.link }}>Switch store ({stores.length})</Text>
            </ListRow>
          </>
        ) : null}
        <Separator />
        <ListRow onPress={() => Linking.openURL(`${server}/app/settings`)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <Text style={{ color: c.link }}>Store settings on the website</Text>
            <Ionicons name="open-outline" size={14} color={c.link} />
          </View>
        </ListRow>
      </Card>

      <SectionTitle>Your plan</SectionTitle>
      <Card style={{ gap: space(2) }}>
        {(Object.keys(FEATURE_LABELS) as Feature[]).map((f) => {
          const on = user.features.includes(f);
          return (
            <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
              <Ionicons name={on ? "checkmark-circle" : "remove-circle-outline"} size={18} color={on ? c.good : c.text3} />
              <Text muted={!on}>{FEATURE_LABELS[f]}</Text>
            </View>
          );
        })}
        <Text variant="small" faint style={{ marginTop: space(1) }}>
          The NepalShop team turns features on for your account.
        </Text>
      </Card>

      <SectionTitle>This phone</SectionTitle>
      <Card style={{ gap: space(1) }}>
        <Text variant="small" muted>
          Server: {server}
        </Text>
        <Text variant="small" muted>
          App version {Constants.expoConfig?.version ?? "?"}
        </Text>
      </Card>

      <Button
        title="Sign out"
        variant="danger"
        icon="log-out-outline"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
        style={{ marginTop: space(6) }}
      />
      <Text variant="small" faint style={{ textAlign: "center", marginTop: space(2) }}>
        Signs out this phone only.
      </Text>
    </ScrollView>
  );
}
