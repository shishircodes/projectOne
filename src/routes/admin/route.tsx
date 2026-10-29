import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { LogOut, Store } from "lucide-react";
import { LogoMark } from "~/components/logo";
import { Button, buttonStyles } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { getSession, logout } from "~/lib/api";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    if (session.user.must_change_password) throw redirect({ to: "/account/password" });
    if (!session.user.is_admin) throw redirect({ to: "/app" });
    return { session };
  },
  head: () => ({ meta: [{ title: "Admin · NepalShop" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { session } = Route.useRouteContext();
  const router = useRouter();
  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-30 border-b border-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2 font-semibold">
            <LogoMark className="size-6" /> NepalShop
          </Link>
          <Badge tone="brand">Admin</Badge>
          <div className="ml-auto flex items-center gap-1">
            {session.store && (
              <Link to="/app" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                <Store /> My store
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                router.navigate({ to: "/login" });
              }}
            >
              <LogOut /> Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
