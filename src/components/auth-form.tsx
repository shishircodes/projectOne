import { Link, useRouter, useHydrated } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Field, FormError, Input } from "./ui/field";
import { LogoMark } from "./logo";
import { api, call } from "~/lib/api";

export function AuthForm({ mode, publicSignup = false }: { mode: "login" | "signup"; publicSignup?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Until React hydrates the form can't submit through JS; keep it from falling back to a page reload.
  const hydrated = useHydrated();
  const signup = mode === "signup";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      if (signup) {
        await call(api.auth.signup.$post({ json: { name: d.name, email: d.email, storeName: d.storeName, password: d.password } }));
        await router.navigate({ to: "/app/settings" });
      } else {
        const { to } = await call(api.auth.login.$post({ json: { email: d.email, password: d.password } }));
        await router.navigate({ to });
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mx-auto mb-6 flex w-fit" aria-label="NepalShop home">
          <LogoMark className="size-10" />
        </Link>
        <h1 className="text-center text-xl font-semibold">{signup ? "Create your store" : "Welcome back"}</h1>
        <p className="mt-1 text-center text-sm text-fg-2">
          {signup ? "Free to start. You can publish whenever you're ready." : "Log in to manage your store."}
        </p>
        <form method="post" onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          {signup && (
            <>
              <Field label="Your name">{(p) => <Input {...p} name="name" required autoComplete="name" />}</Field>
              <Field label="Store name" hint="You can change this later.">
                {(p) => <Input {...p} name="storeName" required placeholder="e.g. Himalayan Threads" autoComplete="organization" />}
              </Field>
            </>
          )}
          <Field label="Email">
            {(p) => <Input {...p} name="email" type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} />}
          </Field>
          <Field label="Password" hint={signup ? "At least 8 characters." : undefined}>
            {(p) => (
              <Input
                {...p}
                name="password"
                type="password"
                required
                minLength={signup ? 8 : undefined}
                autoComplete={signup ? "new-password" : "current-password"}
              />
            )}
          </Field>
          <FormError message={error} />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!hydrated} className="w-full">
            {signup ? "Create store" : "Log in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-fg-2">
          {signup ? "Already have a store? " : publicSignup ? "New to NepalShop? " : "No account yet? "}
          <Link to={signup ? "/login" : "/signup"} className="font-medium text-link hover:underline">
            {signup ? "Log in" : publicSignup ? "Create a store" : "Request access"}
          </Link>
        </p>
      </div>
    </main>
  );
}
