import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "~/components/auth-form";
import { api, call, getSession } from "~/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in · NepalShop" }] }),
  beforeLoad: async () => {
    const s = await getSession();
    if (s) throw redirect({ to: s.user.must_change_password ? "/account/password" : s.store ? "/app" : s.user.is_admin ? "/admin" : "/onboarding" });
  },
  loader: () => call(api.auth.config.$get()),
  component: function Login() {
    const { publicSignup } = Route.useLoaderData();
    return <AuthForm mode="login" publicSignup={publicSignup} />;
  },
});
