import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { AuthForm } from "~/components/auth-form";
import { LogoMark } from "~/components/logo";
import { buttonStyles } from "~/components/ui/button";
import { api, call, getSession } from "~/lib/api";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Get access · NepalShop" }] }),
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: "/app" });
  },
  loader: () => call(api.auth.config.$get()),
  component: Signup,
});

function Signup() {
  const { publicSignup, contactEmail } = Route.useLoaderData();
  if (publicSignup) return <AuthForm mode="signup" publicSignup />;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <Link to="/" className="mx-auto mb-6 flex w-fit" aria-label="NepalShop home">
          <LogoMark className="size-10" />
        </Link>
        <h1 className="text-xl font-semibold">We're in a private trial</h1>
        <p className="mt-2 text-fg-2">
          New stores are set up by the NepalShop team for now. Tell us about your business and we'll create your account and send you sign-in details.
        </p>
        <div className="mt-6 grid gap-2">
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}?subject=${encodeURIComponent("NepalShop access request")}&body=${encodeURIComponent("Name:\nBusiness name:\nWhat you sell:\nPhone:\n")}`}
              className={buttonStyles({ variant: "primary", size: "lg" })}
            >
              <Mail /> Request access
            </a>
          )}
          <Link to="/login" className={buttonStyles({ variant: contactEmail ? "secondary" : "primary", size: "lg" })}>
            I already have an account
          </Link>
        </div>
      </div>
    </main>
  );
}
