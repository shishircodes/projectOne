import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ApiError } from "@/api";
import { useStoreSession } from "@/session";
import { radius, space, useColors } from "@/theme";
import { Badge, ListRow, Separator, Text } from "@/ui";

/** POST stores/:id/open, then reload the session; cached data from the other store is dropped. */
export default function Stores() {
  const c = useColors();
  const { session, switchStore } = useStoreSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(id: string) {
    if (id === session.store.id) return router.back();
    setBusy(id);
    setError(null);
    try {
      await switchStore(id);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space(4), gap: space(3) }}>
      <View style={{ borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
        {session.stores.map((s, i) => (
          <View key={s.id}>
            {i > 0 ? <Separator /> : null}
            <ListRow onPress={() => open(s.id)} chevron={false}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: "600" }}>{s.name}</Text>
                  <Text variant="small" faint>
                    /s/{s.slug}
                  </Text>
                </View>
                {!s.published ? <Badge>Unpublished</Badge> : null}
                {busy === s.id ? (
                  <ActivityIndicator color={c.brand} />
                ) : s.id === session.store.id ? (
                  <Ionicons name="checkmark-circle" size={22} color={c.brand} />
                ) : null}
              </View>
            </ListRow>
          </View>
        ))}
      </View>
      {error ? <Text style={{ color: c.bad }}>{error}</Text> : null}
      <Text variant="small" faint style={{ paddingHorizontal: space(1) }}>
        To create another store, use the store switcher on the website.
      </Text>
    </ScrollView>
  );
}
