import { Pressable, View, type ColorValue } from "react-native";
import Tabs from "expo-router/js-tabs";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@/queries";
import { useStoreSession } from "@/session";
import { space, useColors } from "@/theme";
import { Text, type IconName } from "@/ui";

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={typeof color === "string" ? color : undefined} />;

/** Header title: the open store, and a switcher when the seller has more than one. */
function StoreTitle() {
  const c = useColors();
  const { session } = useStoreSession();
  const many = session.stores.length > 1;
  const title = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space(1) }}>
      <Text variant="heading" numberOfLines={1} style={{ maxWidth: 220 }}>
        {session.store.name}
      </Text>
      {many ? <Ionicons name="chevron-down" size={16} color={c.text2} /> : null}
    </View>
  );
  if (!many) return title;
  return (
    <Pressable onPress={() => router.push("/stores")} accessibilityRole="button" accessibilityLabel={`${session.store.name}. Switch store`} hitSlop={8}>
      {title}
    </Pressable>
  );
}

/** One tab per feature the admin turned on for this seller (session.user.features). Account is always there. */
export default function TabsLayout() {
  const c = useColors();
  const { has } = useStoreSession();
  const counts = useCounts().data;

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <StoreTitle />,
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: c.surface },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.text3,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarBadgeStyle: { backgroundColor: c.brand, color: c.brandInk },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Protected guard={has("analytics")}>
        <Tabs.Screen name="index" options={{ title: "Overview", tabBarIcon: icon("stats-chart") }} />
      </Tabs.Protected>
      <Tabs.Protected guard={has("orders")}>
        <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: icon("receipt-outline"), tabBarBadge: counts?.pending || undefined }} />
      </Tabs.Protected>
      <Tabs.Protected guard={has("inbox")}>
        <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon("chatbubbles-outline"), tabBarBadge: counts?.unread || undefined }} />
      </Tabs.Protected>
      <Tabs.Protected guard={has("products")}>
        <Tabs.Screen name="products" options={{ title: "Products", tabBarIcon: icon("cube-outline") }} />
      </Tabs.Protected>
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}
