import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type TextInputInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, defaultServer } from "@/api";
import { useSession } from "@/session";
import { radius, space, useColors } from "@/theme";
import { Button, Field, Text } from "@/ui";

export default function Login() {
  const c = useColors();
  const { signIn, server, changeServer } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editServer, setEditServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(server);
  const passwordRef = useRef<TextInputInstance>(null);

  async function submit() {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    try {
      if (editServer) await changeServer(serverDraft.trim() === defaultServer() ? "" : serverDraft.trim());
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space(6), gap: space(4), maxWidth: 480, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: space(3), marginBottom: space(4) }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="storefront" size={32} color={c.brandInk} />
            </View>
            <Text variant="title">NepalShop Seller</Text>
            <Text muted style={{ textAlign: "center" }}>
              Orders, messages and stock for your store, on your phone.
            </Text>
          </View>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="you@example.com"
          />
          <Field
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {error ? (
            <View style={{ backgroundColor: c.badSoft, borderRadius: radius.md, padding: space(3) }} accessibilityLiveRegion="polite">
              <Text style={{ color: c.bad }}>{error}</Text>
            </View>
          ) : null}
          <Button title="Sign in" onPress={submit} loading={busy} />

          {editServer ? (
            <Field
              label="Server"
              value={serverDraft}
              onChangeText={setServerDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              hint="Your computer's address while testing, e.g. http://192.168.1.20:3000"
            />
          ) : (
            <Pressable onPress={() => setEditServer(true)} hitSlop={8} style={{ alignSelf: "center", padding: space(2) }}>
              <Text variant="small" faint>
                Server: {server.replace(/^https?:\/\//, "")} · Change
              </Text>
            </Pressable>
          )}
          <Text variant="small" faint style={{ textAlign: "center" }}>
            No account yet? NepalShop is invite-only during the trial. Ask the NepalShop team for access.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
