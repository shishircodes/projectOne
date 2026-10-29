import { createFileRoute, redirect, useRouter, useHydrated } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CenteredCard } from "~/components/centered-card";
import { Button } from "~/components/ui/button";
import { Field, FormError, Input } from "~/components/ui/field";
import { api, call, getSession } from "~/lib/api";

export const Route = createFileRoute("/account/password")({
  head: () => ({ meta: [{ title: "Password · NepalShop" }] }),
  beforeLoad: async () => {
    const s = await getSession();
    if (!s) throw redirect({ to: "/login" });
    return { session: s };
  },
  component: PasswordPage,
});

function PasswordPage() {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const first = session.user.must_change_password;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Until React hydrates the form can't submit through JS; keep it from falling back to a page reload.
  const hydrated = useHydrated();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (d.next !== d.confirm) return setError("The two passwords don't match");
    setBusy(true);
    setError(null);
    try {
      const { to } = await call(api.auth.password.$post({ json: { current: d.current, next: d.next } }));
      toast.success(first ? "Password set. Welcome to NepalShop!" : "Password changed");
      await router.navigate({ to });
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <CenteredCard
      title={first ? "Choose your password" : "Change password"}
      description={first ? "You signed in with a temporary password. Pick your own to continue." : session.user.email}
    >
      <form method="post" onSubmit={submit} className="grid gap-4">
        {/* Lets password managers attach the new password to the right account. */}
        <input type="email" name="username" value={session.user.email} autoComplete="username" readOnly hidden />
        {!first && <Field label="Current password">{(p) => <Input {...p} name="current" type="password" required autoComplete="current-password" />}</Field>}
        <Field label="New password" hint="At least 8 characters.">
          {(p) => <Input {...p} name="next" type="password" required minLength={8} autoComplete="new-password" autoFocus={first} />}
        </Field>
        <Field label="Repeat new password">{(p) => <Input {...p} name="confirm" type="password" required minLength={8} autoComplete="new-password" />}</Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!hydrated}>
          {first ? "Set password and continue" : "Change password"}
        </Button>
        {!first && (
          <Button variant="ghost" onClick={() => router.history.back()}>
            Cancel
          </Button>
        )}
      </form>
    </CenteredCard>
  );
}
