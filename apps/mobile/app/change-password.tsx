import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { api, ApiError, call } from "@/api";
import { useSession } from "@/session";
import { radius, space, useColors } from "@/theme";
import { Button, Field, Text } from "@/ui";

/** Shown when the account has a one-time password (new or reset by an admin): POST auth/password. */
export default function ChangePassword() {
  const c = useColors();
  const { session, refresh, signOut } = useSession();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (next !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await call(api.auth.password.$post({ json: { next } }));
      await refresh(); // must_change_password is now false; the root layout moves on
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: space(5), gap: space(4) }} keyboardShouldPersistTaps="handled">
        <Text muted>
          Hi {session?.user.name.split(" ")[0]}, you signed in with a one-time password. Choose your own password to continue.
        </Text>
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Field label="Type it again" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
        {error ? (
          <View style={{ backgroundColor: c.badSoft, borderRadius: radius.md, padding: space(3) }}>
            <Text style={{ color: c.bad }}>{error}</Text>
          </View>
        ) : null}
        <Button title="Save password" onPress={submit} loading={busy} disabled={!next} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
