import { useState } from "react";
import { Linking, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ApiError } from "@/api";
import { useSession } from "@/session";
import { space, useColors } from "@/theme";
import { Button, Text } from "@/ui";

/** The API answered no_store: this account has no store open. Stores are created on the website. */
export default function NoStore() {
  const c = useColors();
  const { session, server, refresh, signOut, switchStore } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stores = session?.stores ?? [];

  async function open(id: string) {
    setError(null);
    try {
      await switchStore(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, justifyContent: "center", padding: space(6), gap: space(4) }}>
        <Ionicons name="storefront-outline" size={44} color={c.brand} style={{ alignSelf: "center" }} />
        <Text variant="title" style={{ textAlign: "center" }}>
          {stores.length ? "Choose a store" : "Create your store on the website"}
        </Text>
        <Text muted style={{ textAlign: "center" }}>
          {stores.length
            ? "Pick which store to manage on this phone."
            : `You don't have a store yet. Sign in at ${server.replace(/^https?:\/\//, "")} on a computer or browser, name your store, then come back here.`}
        </Text>
        {stores.map((s) => (
          <Button key={s.id} title={s.name} variant="secondary" onPress={() => open(s.id)} />
        ))}
        {error ? <Text style={{ color: c.bad, textAlign: "center" }}>{error}</Text> : null}
        {!stores.length ? <Button title="Open the website" icon="open-outline" variant="secondary" onPress={() => Linking.openURL(`${server}/onboarding`)} /> : null}
        <Button
          title="I've created it, check again"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await refresh();
            setBusy(false);
          }}
        />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}
