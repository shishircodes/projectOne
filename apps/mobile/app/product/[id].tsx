import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, call, imageUrl, uploadImage, type Data } from "@/api";
import { cap, dateTime, num } from "@/format";
import { keys, useInvalidate } from "@/queries";
import { radius, space, type as t, useColors } from "@/theme";
import { Badge, Button, Card, Chip, ErrorState, Field, Loading, SectionTitle, Separator, Text } from "@/ui";

type Product = Data<(typeof api.products)[":id"]["$get"]>;
type ProductInput = Parameters<(typeof api.products)[":id"]["$put"]>[0]["json"];
type Status = "active" | "draft" | "archived";
type Draft = { price?: string; compare_at_price?: string; stock?: string; status?: Status };

const MAX_PHOTOS = 8;

/** PUT products/:id replaces the whole product, so every save starts from the server's copy. */
const toInput = (p: Product, patch: Partial<ProductInput> = {}): ProductInput => ({
  name: p.name,
  description: p.description,
  sku: p.sku,
  price: p.price,
  compare_at_price: p.compare_at_price,
  cost_price: p.cost_price,
  stock: p.stock,
  low_stock_threshold: p.low_stock_threshold,
  track_stock: p.track_stock,
  images: p.images,
  status: p.status,
  category_id: p.category_id,
  ...patch,
});

function notify(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function ask(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function ProductDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const product = useQuery({ queryKey: keys.product(id), queryFn: () => call(api.products[":id"].$get({ param: { id } })) });
  const history = useQuery({ queryKey: keys.stock(id), queryFn: () => call(api.products[":id"].stock.$get({ param: { id } })) });

  // Only the fields the seller has touched; everything else shows the server's current value.
  const [draft, setDraft] = useState<Draft>({});
  const [restockQty, setRestockQty] = useState("");
  const [restockNote, setRestockNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshAll = () => invalidate(keys.products, ["stats"]);
  const onSaved = (p: Product) => {
    qc.setQueryData(keys.product(id), p);
    void refreshAll();
  };

  const save = useMutation({
    mutationFn: (input: ProductInput) => call(api.products[":id"].$put({ param: { id }, json: input })),
    onSuccess: (p) => {
      onSaved(p);
      setDraft({});
      setSaveError(null);
    },
    onError: (e) => setSaveError(e.message),
  });

  const photos = useMutation({
    mutationFn: async (images: string[]) => call(api.products[":id"].$put({ param: { id }, json: toInput(product.data!, { images }) })),
    onSuccess: onSaved,
    onError: (e) => notify("Couldn't update photos", e.message),
  });

  const [uploading, setUploading] = useState(false);

  const restock = useMutation({
    mutationFn: (input: { change: number; reason: "restock" | "damage"; note?: string }) => call(api.products[":id"].stock.$post({ param: { id }, json: input })),
    onSuccess: ({ stock }) => {
      qc.setQueryData<Product>(keys.product(id), (p) => (p ? { ...p, stock } : p));
      setRestockQty("");
      setRestockNote("");
      void invalidate(keys.stock(id), keys.products, ["stats"]);
    },
    onError: (e) => notify("Couldn't change stock", e.message),
  });

  if (product.isPending) return <Loading />;
  if (product.isError) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;

  const shown = {
    price: draft.price ?? String(p.price),
    compare_at_price: draft.compare_at_price ?? (p.compare_at_price === null ? "" : String(p.compare_at_price)),
    stock: draft.stock ?? String(p.stock),
    status: draft.status ?? (p.status as Status),
  };
  const dirty = Object.keys(draft).length > 0;

  function submit() {
    save.mutate(
      toInput(p, {
        price: shown.price.trim(),
        compare_at_price: shown.compare_at_price.trim() || null,
        stock: shown.stock.trim(),
        status: shown.status,
      }),
    );
  }

  async function addPhoto(source: "camera" | "library") {
    if (p.images.length >= MAX_PHOTOS) return notify("Photo limit reached", `A product can have up to ${MAX_PHOTOS} photos. Remove one first.`);
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return notify(
        source === "camera" ? "Camera access is off" : "Photo access is off",
        `Allow ${source === "camera" ? "camera" : "photo"} access for Expo Go / NepalShop in your phone's Settings to add product photos.`,
      );
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(result.assets[0]);
      await photos.mutateAsync([...p.images, url]);
    } catch (e) {
      if (e instanceof ApiError) notify("Couldn't upload the photo", e.message);
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(url: string) {
    if (await ask("Remove this photo?", "It disappears from the product and your store.", "Remove")) photos.mutate(p.images.filter((u) => u !== url));
  }

  function changeStock(reason: "restock" | "damage") {
    const n = Number(restockQty);
    if (!Number.isInteger(n) || n <= 0) return notify("Enter a quantity", "Type how many units, as a whole number above zero.");
    restock.mutate({ change: reason === "damage" ? -n : n, reason, note: restockNote.trim() || undefined });
  }

  const busyPhotos = uploading || photos.isPending;

  return (
    <>
      <Stack.Screen options={{ title: p.name }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
        <ScrollView
          style={{ backgroundColor: c.bg }}
          contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={product.isRefetching} onRefresh={() => void Promise.all([product.refetch(), history.refetch()])} tintColor={c.brand} />}
        >
          <Text variant="title">{p.name}</Text>
          <View style={{ flexDirection: "row", gap: space(2), marginTop: space(2), flexWrap: "wrap" }}>
            {p.sku ? <Badge>SKU {p.sku}</Badge> : null}
            {p.category_name ? <Badge tone="brand">{p.category_name}</Badge> : null}
          </View>

          <SectionTitle right={<Text variant="small" faint>{`${p.images.length}/${MAX_PHOTOS}`}</Text>}>Photos</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
            {p.images.map((u, i) => (
              <View key={u} style={{ width: 120, height: 120, borderRadius: radius.md, overflow: "hidden", backgroundColor: c.surface2 }}>
                <Image source={{ uri: imageUrl(u) }} style={{ width: 120, height: 120 }} contentFit="cover" transition={150} />
                {i === 0 ? (
                  <View style={{ position: "absolute", left: 6, bottom: 6 }}>
                    <Badge tone="brand">Cover</Badge>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => removePhoto(u)}
                  disabled={busyPhotos}
                  accessibilityLabel="Remove photo"
                  hitSlop={6}
                  style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
            {busyPhotos ? (
              <View style={{ width: 120, height: 120, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={c.brand} />
              </View>
            ) : null}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: space(2), marginTop: space(3) }}>
            <Button title="Take photo" icon="camera-outline" variant="secondary" small onPress={() => addPhoto("camera")} disabled={busyPhotos} style={{ flex: 1 }} />
            <Button title="From library" icon="images-outline" variant="secondary" small onPress={() => addPhoto("library")} disabled={busyPhotos} style={{ flex: 1 }} />
          </View>

          <SectionTitle>Price and stock</SectionTitle>
          <Card style={{ gap: space(4) }}>
            <View style={{ flexDirection: "row", gap: space(3) }}>
              <View style={{ flex: 1 }}>
                <Field label="Price" prefix="Rs." value={shown.price} onChangeText={(v) => setDraft((d) => ({ ...d, price: v }))} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Was (optional)"
                  prefix="Rs."
                  value={shown.compare_at_price}
                  onChangeText={(v) => setDraft((d) => ({ ...d, compare_at_price: v }))}
                  keyboardType="decimal-pad"
                  hint="Shown struck through"
                />
              </View>
            </View>
            {p.track_stock ? (
              <Field
                label="In stock"
                value={shown.stock}
                onChangeText={(v) => setDraft((d) => ({ ...d, stock: v }))}
                keyboardType="number-pad"
                hint={`Low-stock alert at ${num(p.low_stock_threshold)}. Changing this is recorded as an adjustment.`}
              />
            ) : (
              <Text muted>Stock isn't tracked for this product. Turn tracking on from the website.</Text>
            )}
            <View style={{ gap: space(2) }}>
              <Text variant="small" muted style={{ fontWeight: "600" }}>
                Status
              </Text>
              <View style={{ flexDirection: "row", gap: space(2) }}>
                {(["active", "draft", "archived"] as Status[]).map((s) => (
                  <Chip key={s} label={cap(s)} selected={shown.status === s} onPress={() => setDraft((d) => ({ ...d, status: s }))} />
                ))}
              </View>
              <Text variant="small" faint>
                {shown.status === "active" ? "Shown in your store." : shown.status === "draft" ? "Hidden from your store while you work on it." : "Hidden and kept for your records."}
              </Text>
            </View>
            {saveError ? <Text style={{ color: c.bad }}>{saveError}</Text> : null}
            <View style={{ flexDirection: "row", gap: space(2) }}>
              {dirty ? <Button title="Discard" variant="secondary" onPress={() => (setDraft({}), setSaveError(null))} style={{ flex: 1 }} /> : null}
              <Button title={dirty ? "Save changes" : "Saved"} onPress={submit} loading={save.isPending} disabled={!dirty} style={{ flex: 2 }} />
            </View>
          </Card>

          {p.track_stock ? (
            <>
              <SectionTitle>Restock</SectionTitle>
              <Card style={{ gap: space(3) }}>
                <Field label="Quantity" value={restockQty} onChangeText={setRestockQty} keyboardType="number-pad" placeholder="e.g. 12" />
                <Field label="Note (optional)" value={restockNote} onChangeText={setRestockNote} placeholder="Supplier, batch…" maxLength={300} />
                <View style={{ flexDirection: "row", gap: space(2) }}>
                  <Button
                    title="Add to stock"
                    icon="add-circle-outline"
                    onPress={() => changeStock("restock")}
                    loading={restock.isPending && restock.variables?.reason === "restock"}
                    disabled={restock.isPending}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Damaged"
                    icon="remove-circle-outline"
                    variant="danger"
                    onPress={() => changeStock("damage")}
                    loading={restock.isPending && restock.variables?.reason === "damage"}
                    disabled={restock.isPending}
                  />
                </View>
              </Card>

              <SectionTitle>Stock history</SectionTitle>
              <Card padded={false}>
                {history.isPending ? (
                  <ActivityIndicator style={{ padding: space(4) }} color={c.brand} />
                ) : history.isError ? (
                  <Text muted style={{ padding: space(4) }}>
                    {history.error.message}
                  </Text>
                ) : history.data.length === 0 ? (
                  <Text muted style={{ padding: space(4) }}>
                    No stock changes yet.
                  </Text>
                ) : (
                  history.data.slice(0, 15).map((m, i) => (
                    <View key={m.id}>
                      {i > 0 ? <Separator /> : null}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), padding: space(3), paddingHorizontal: space(4) }}>
                        <View style={{ flex: 1 }}>
                          <Text>
                            {cap(m.reason)}
                            {m.order_number ? ` · order #${m.order_number}` : ""}
                          </Text>
                          <Text variant="small" faint numberOfLines={1}>
                            {dateTime(m.created_at)}
                            {m.note ? ` · ${m.note}` : ""}
                          </Text>
                        </View>
                        <Text style={[t.number, { fontWeight: "600", color: m.change > 0 ? c.good : c.bad }]}>
                          {m.change > 0 ? "+" : ""}
                          {num(m.change)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
