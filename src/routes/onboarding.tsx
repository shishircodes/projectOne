import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { buttonStyles } from "~/components/ui/button";
import { CenteredCard } from "~/components/centered-card";
import { Button } from "~/components/ui/button";
import { Field, FormError, Input } from "~/components/ui/field";
import { api, call, getSession, logout } from "~/lib/api";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Create your store · NepalShop" }] }),
  beforeLoad: async () => {
    const s = await getSession();
    if (!s) throw redirect({ to: "/login" });
    if (s.user.must_change_password) throw redirect({ to: "/account/password" });
    // New store: allowed while under the limit the admin set; otherwise back to the dashboard.
    if (s.store && s.stores.length >= s.user.max_stores) throw redirect({ to: "/app" });
    return { session: s };
  },
  component: Onboarding,
});

function Onboarding() {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(api.stores.$post({ json: { name } }));
      await router.navigate({ to: "/app/settings" });
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const first = session.stores.length === 0;
  if (session.user.max_stores === 0) {
    return (
      <CenteredCard title="No store yet" description="Your account isn't set up to create stores. The NepalShop team can turn this on for you.">
        <div className="grid gap-2">
          {session.user.is_admin && (
            <Link to="/admin" className={buttonStyles({ variant: "primary", size: "lg" })}>
              Go to the admin console
            </Link>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              router.navigate({ to: "/login" });
            }}
          >
            Log out
          </Button>
        </div>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title={first ? `Welcome, ${session.user.name.split(/\s+/)[0]}` : "New store"}
      description={
        first
          ? "Name your store to get started. You can change everything later."
          : `This will be store ${session.stores.length + 1} of the ${session.user.max_stores} you can have.`
      }
    >
      <form method="post" onSubmit={submit} className="grid gap-4">
        <Field label="Store name" hint={slug ? `Your store's address: /s/${slug}` : "For example: Himalayan Threads"}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus autoComplete="organization" />}
        </Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!name.trim()}>
          Create store
        </Button>
        {!first && (
          <Link to="/app" className={buttonStyles({ variant: "ghost" })}>
            Back to {session.store?.name ?? "your store"}
          </Link>
        )}
        {first && session.user.is_admin && (
          <Button variant="ghost" onClick={() => router.navigate({ to: "/admin" })}>
            Skip, go to the admin console
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            router.navigate({ to: "/login" });
          }}
        >
          Log out
        </Button>
      </form>
    </CenteredCard>
  );
}
