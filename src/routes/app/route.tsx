import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "~/components/app/shell";
import type { StoreSession } from "~/lib/types";
import { api, call, getSession } from "~/lib/api";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    if (session.user.must_change_password) throw redirect({ to: "/account/password" });
    if (!session.store) throw redirect({ to: session.user.is_admin ? "/admin" : "/onboarding" });
    return { session: session as StoreSession & { baseDomain: string | null } };
  },
  loader: () => call(api.store.counts.$get()),
  head: () => ({ meta: [{ title: "Dashboard · NepalShop" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  const counts = Route.useLoaderData();
  return (
    <AppShell session={session} counts={counts}>
      <Outlet />
    </AppShell>
  );
}
