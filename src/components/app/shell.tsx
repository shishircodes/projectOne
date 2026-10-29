import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  Check,
  ChevronsUpDown,
  Plus,
  KeyRound,
  ShieldCheck,
  Boxes,
  ExternalLink,
  FolderTree,
  Home,
  LogOut,
  Menu as MenuIcon,
  MessagesSquare,
  Moon,
  Plug,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  SunMoon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { LogoMark } from "~/components/logo";
import { Button, buttonStyles } from "~/components/ui/button";
import { DropdownMenu, MenuItem, MenuSeparator, Sheet } from "~/components/ui/overlay";
import { Badge } from "~/components/ui/badge";
import { Kbd, Switch } from "~/components/ui/misc";
import { channelLabel } from "~/components/ui/badge";
import { CommandMenu } from "./command-menu";
import { cn } from "~/lib/cn";
import { rs } from "~/lib/format";
import { useLive, useLiveConnection, type LiveEvent } from "~/lib/live";
import { useTheme, type ThemePref } from "~/lib/theme";
import { canSee } from "~/lib/nav";
import type { Feature } from "~/lib/features";
import type { StoreSession } from "~/lib/types";
import { api, call, logout as endSession } from "~/lib/api";

type NavItem = { to: string; label: string; icon: typeof Home; feature: Feature | null; exact?: boolean; count?: "pending" | "unread" };
const NAV: NavItem[] = [
  { to: "/app", label: "Overview", icon: Home, feature: "analytics", exact: true },
  { to: "/app/orders", label: "Orders", icon: ShoppingBag, feature: "orders", count: "pending" },
  { to: "/app/inbox", label: "Inbox", icon: MessagesSquare, feature: "inbox", count: "unread" },
  { to: "/app/products", label: "Products", icon: Boxes, feature: "products" },
  { to: "/app/categories", label: "Categories", icon: FolderTree, feature: "products" },
  { to: "/app/channels", label: "Channels", icon: Plug, feature: "channels" },
  { to: "/app/settings", label: "Settings", icon: Settings, feature: null },
];

export function storeUrl(session: StoreSession & { baseDomain?: string | null }) {
  const s = session.store;
  if (s.custom_domain) return `https://${s.custom_domain}`;
  if (session.baseDomain) return `https://${s.slug}.${session.baseDomain}`;
  return `/s/${s.slug}`;
}

export function AppShell({
  session,
  counts,
  children,
}: {
  session: StoreSession & { baseDomain?: string | null };
  counts: { unread: number; pending: number };
  children: ReactNode;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useLiveConnection();

  // Live events: refresh what's on screen and tell the owner what happened.
  const onLive = useCallback(
    (e: LiveEvent) => {
      router.invalidate();
      if (e.type === "message:new" && e.data.message.direction === "in") {
        const c = e.data.conversation;
        if (pathname === `/app/inbox/${c.id}`) return;
        toast(`${c.customer_name || "Customer"} · ${channelLabel(c.channel)}`, {
          description: e.data.message.body.slice(0, 120),
          action: { label: "Reply", onClick: () => navigate({ to: "/app/inbox/$id", params: { id: String(c.id) } }) },
        });
      } else if (e.type === "order:new") {
        toast(`New order #${e.data.order_number}`, {
          description: `${e.data.customer_name} · ${rs(e.data.total)}`,
          action: { label: "View", onClick: () => navigate({ to: "/app/orders", search: { order: String(e.data.id) } }) },
        });
      } else if (e.type === "order:paid") {
        toast.success(`Order #${e.data.order_number} paid`, { description: `${rs(e.data.total)} via ${e.data.payment_method === "esewa" ? "eSewa" : "Khalti"}` });
      }
    },
    [router, navigate, pathname],
  );
  useLive(onLive);

  // ⌘K / Ctrl+K opens search (no animation for keyboard-driven actions).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (to: string, exact?: boolean) => (exact ? pathname === to || pathname === `${to}/` : pathname.startsWith(to));
  const count = (k?: "unread" | "pending") => (k ? counts[k] : 0);
  const site = storeUrl(session);
  // Only the features the admin turned on for this account.
  const can = (f: Feature) => session.user.features.includes(f);
  const nav = NAV.filter((n) => canSee(session.user.features, n.feature));
  // Phone tab bar: up to four primary pages (Settings lives under More unless there's room).
  const mobileTabs = nav.filter((n) => n.to !== "/app/categories" && n.to !== "/app/channels").slice(0, 4);
  const moreItems = nav.filter((n) => !mobileTabs.includes(n));

  async function logout() {
    await endSession();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-border bg-surface px-3 pb-3 pt-4 lg:flex">
        <div className="mb-3">
          <StoreSwitcher session={session} />
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="pressable mb-2 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-sm text-fg-3 hover:border-border-strong"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search</span>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>
        <nav className="grid gap-0.5" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, ...n }) => {
            const active = isActive(to, n.exact);
            const c = count(n.count);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium",
                  active ? "bg-surface-2 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon className={cn("size-4", active ? "text-fg" : "text-fg-3")} aria-hidden />
                <span className="flex-1">{label}</span>
                {c > 0 && (
                  <span className="tabular min-w-5 rounded-full bg-brand px-1.5 text-center text-xs font-semibold leading-5 text-brand-ink">
                    {c > 99 ? "99+" : c}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-1">
          {session.user.is_admin && (
            <Link to="/admin" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "justify-start")}>
              <ShieldCheck /> Admin console
            </Link>
          )}
          <Link to="/account/password" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "justify-start")}>
            <KeyRound /> Change password
          </Link>
          {can("storefront") && (
            <a href={site} target="_blank" rel="noopener" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "justify-start")}>
              <ExternalLink /> View your site
            </a>
          )}
          <ThemeMenu />
          <Button variant="ghost" size="sm" className="justify-start" onClick={logout}>
            <LogOut /> Log out
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Top bar: translucent material so content scrolls underneath */}
        <header className="glass sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface/80 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-xl backdrop-saturate-150 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <LogoMark className="size-6" />
            <span className="truncate text-sm font-semibold">{session.store.name}</span>
          </div>
          {can("storefront") && <PublishToggle published={session.store.published} />}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
              <Search />
            </Button>
            {can("storefront") && (
              <a href={site} target="_blank" rel="noopener" className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "hidden sm:inline-flex")}>
                View site <ExternalLink />
              </a>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[84rem] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      {/* Phone bottom tab bar */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }}
      >
        {mobileTabs.map(({ to, label, icon: Icon, ...n }) => {
          const active = isActive(to, n.exact);
          const c = count(n.count);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn("pressable relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-fg" : "text-fg-3")}
            >
              <Icon className="size-5" aria-hidden />
              {label}
              {c > 0 && (
                <span className="tabular absolute left-1/2 top-1.5 ml-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-brand-ink">
                  {c > 99 ? "99+" : c}
                </span>
              )}
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)} className="pressable flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-fg-3">
          <MenuIcon className="size-5" aria-hidden />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={session.store.name} description={session.user.email} width="20rem">
        <nav className="grid gap-1" aria-label="More">
          {session.stores.length > 1 && (
            <div className="mb-2">
              <StoreSwitcher session={session} />
            </div>
          )}
          {moreItems.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} onClick={() => setMoreOpen(false)} className="pressable flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-surface-2">
              <Icon className="size-5 text-fg-3" aria-hidden /> {label}
            </Link>
          ))}
          {can("storefront") && (
            <a href={site} target="_blank" rel="noopener" className="pressable flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-surface-2">
              <ExternalLink className="size-5 text-fg-3" aria-hidden /> View your site
            </a>
          )}
          {session.user.is_admin && (
            <Link to="/admin" className="pressable flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-surface-2">
              <ShieldCheck className="size-5 text-fg-3" aria-hidden /> Admin console
            </Link>
          )}
          <Link to="/account/password" className="pressable flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-surface-2">
            <KeyRound className="size-5 text-fg-3" aria-hidden /> Change password
          </Link>
          <div className="my-2 h-px bg-border" />
          <ThemeMenu />
          <button onClick={logout} className="pressable flex h-11 items-center gap-3 rounded-lg px-3 font-medium text-bad hover:bg-bad-soft">
            <LogOut className="size-5" aria-hidden /> Log out
          </button>
        </nav>
      </Sheet>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} siteUrl={can("storefront") ? site : null} features={session.user.features} />
    </div>
  );
}

function PublishToggle({ published }: { published: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(published);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(published), [published]);
  async function change(next: boolean) {
    setValue(next); // optimistic
    setBusy(true);
    try {
      await call(api.store.published.$put({ json: { published: next } }));
      if (next) toast.success("Your store is live", { description: "Customers can now browse and order." });
      else toast("Store unpublished", { description: "Only you can preview it now.", action: { label: "Undo", onClick: () => change(true) } });
      router.invalidate();
    } catch (e: any) {
      setValue(!next);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  // Only the switch toggles (not the text beside it): unpublishing takes the store offline.
  return (
    <div className="flex items-center gap-2 text-sm">
      <Switch checked={value} onCheckedChange={change} disabled={busy} label={value ? "Store is live. Unpublish" : "Store is not published. Publish"} />
      {value ? (
        <Badge tone="good" dot>
          Live
        </Badge>
      ) : (
        <span className="text-fg-2">Not published</span>
      )}
    </div>
  );
}

function ThemeMenu() {
  const { pref, setTheme } = useTheme();
  const items: { value: ThemePref; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: SunMoon },
  ];
  const current = items.find((i) => i.value === pref) ?? items[2];
  return (
    <DropdownMenu
      align="start"
      trigger={
        <Button variant="ghost" size="sm" className="justify-start">
          <current.icon /> Theme: {current.label}
        </Button>
      }
    >
      {items.map(({ value, label, icon: Icon }) => (
        <MenuItem key={value} onClick={() => setTheme(value)}>
          <Icon /> {label}
          {pref === value && <span className="ml-auto text-xs text-fg-3">✓</span>}
        </MenuItem>
      ))}
      <MenuSeparator />
      <p className="px-2.5 py-1 text-xs text-fg-3">System follows your device.</p>
    </DropdownMenu>
  );
}

/** Current store, with a menu to switch between stores and create a new one (up to the admin's limit). */
function StoreSwitcher({ session }: { session: StoreSession }) {
  const router = useRouter();
  const canCreate = session.stores.length < session.user.max_stores;
  const multi = session.stores.length > 1 || canCreate;
  const label = (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
      <LogoMark />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold" title={session.store.name}>
          {session.store.name}
        </span>
        <span className="block truncate text-xs text-fg-3">{multi ? `${session.stores.length} of ${session.user.max_stores} stores` : session.user.email}</span>
      </span>
    </span>
  );
  if (!multi) return <div className="flex items-center px-2 py-1">{label}</div>;

  async function open(id: string) {
    if (String(id) === String(session.store.id)) return;
    try {
      await call(api.stores[":id"].open.$post({ param: { id } }));
      await router.navigate({ to: "/app" });
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <DropdownMenu
      align="start"
      trigger={
        <button type="button" className="pressable flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2" aria-label="Switch store">
          {label}
          <ChevronsUpDown className="size-4 shrink-0 text-fg-3" aria-hidden />
        </button>
      }
    >
      <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-3">Your stores</p>
      {session.stores.map((st) => (
        <MenuItem key={st.id} onClick={() => open(st.id)}>
          <span className="min-w-0 flex-1 truncate">{st.name}</span>
          {String(st.id) === String(session.store.id) && <Check className="!text-fg" />}
        </MenuItem>
      ))}
      <MenuSeparator />
      {canCreate ? (
        <MenuItem onClick={() => router.navigate({ to: "/onboarding" })}>
          <Plus /> New store
        </MenuItem>
      ) : (
        <p className="px-2.5 py-1.5 text-xs text-fg-3">Store limit reached ({session.user.max_stores}).</p>
      )}
    </DropdownMenu>
  );
}
