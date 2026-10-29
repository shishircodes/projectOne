import { Dialog } from "@base-ui/react/dialog";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Boxes, ExternalLink, FolderTree, Home, MessagesSquare, Moon, Package, Plug, Plus, Search, Settings, ShoppingBag, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { rs } from "~/lib/format";
import { setTheme, useTheme } from "~/lib/theme";
import { ChannelTag, OrderStatusBadge } from "~/components/ui/badge";
import type { Feature } from "~/lib/features";
import type { InferResponseType } from "hono/client";
import { api, call } from "~/lib/api";

type Results = InferResponseType<typeof api.store.search.$get>;

export function CommandMenu({
  open,
  onOpenChange,
  siteUrl,
  features,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  siteUrl: string | null;
  features: Feature[];
}) {
  const can = (f: Feature) => features.includes(f);
  const navigate = useNavigate();
  const { resolved } = useTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults(null);
    }
  }, [open]);

  // Debounced server search; stale responses are ignored.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults(null);
    let live = true;
    const t = setTimeout(async () => {
      const r = await call(api.store.search.$get({ query: { q: term } })).catch(() => null);
      if (live) setResults(r);
    }, 140);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* No enter/exit animation: this is opened from the keyboard many times a day. */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Dialog.Popup className="fixed left-1/2 top-[12dvh] z-50 w-[min(38rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg outline-none">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={!results} loop label="Search and commands" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search, or type a command"
                className="h-12 w-full bg-transparent text-base outline-none placeholder:text-fg-3"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-3">{q.trim().length >= 2 ? "Nothing found." : "Type to search."}</Command.Empty>

              {results && (
                <>
                  {results.orders.length > 0 && (
                    <Command.Group heading="Orders">
                      {results.orders.map((o) => (
                        <Item key={`o${o.id}`} value={`order ${o.order_number} ${o.customer_name}`} icon={<ShoppingBag />} onSelect={() => go(() => navigate({ to: "/app/orders", search: { order: o.id } }))}>
                          <span className="font-medium">#{o.order_number}</span>
                          <span className="min-w-0 flex-1 truncate text-fg-2">{o.customer_name}</span>
                          <OrderStatusBadge status={o.status} />
                          <span className="tabular text-sm text-fg-2">{rs(o.total)}</span>
                        </Item>
                      ))}
                    </Command.Group>
                  )}
                  {results.products.length > 0 && (
                    <Command.Group heading="Products">
                      {results.products.map((p) => (
                        <Item key={`p${p.id}`} value={`product ${p.name} ${p.sku ?? ""}`} icon={<Package />} onSelect={() => go(() => navigate({ to: "/app/products", search: { product: p.id } }))}>
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          {p.track_stock && <span className="tabular text-xs text-fg-3">{p.stock} in stock</span>}
                        </Item>
                      ))}
                    </Command.Group>
                  )}
                  {results.conversations.length > 0 && (
                    <Command.Group heading="Conversations">
                      {results.conversations.map((c) => (
                        <Item key={`c${c.id}`} value={`chat ${c.customer_name ?? ""} ${c.last_message ?? ""}`} icon={<MessagesSquare />} onSelect={() => go(() => navigate({ to: "/app/inbox/$id", params: { id: c.id } }))}>
                          <span className="font-medium">{c.customer_name ?? "Customer"}</span>
                          <span className="min-w-0 flex-1 truncate text-fg-2">{c.last_message}</span>
                          <ChannelTag channel={c.channel} />
                        </Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}

              {!results && (
                <>
                  {(can("orders") || can("products")) && (
                    <Command.Group heading="Create">
                      {can("orders") && <Item icon={<Plus />} onSelect={() => go(() => navigate({ to: "/app/orders", search: { order: "new" } }))}>New order</Item>}
                      {can("products") && <Item icon={<Plus />} onSelect={() => go(() => navigate({ to: "/app/products", search: { product: "new" } }))}>New product</Item>}
                    </Command.Group>
                  )}
                  <Command.Group heading="Go to">
                    {can("analytics") && <Item icon={<Home />} onSelect={() => go(() => navigate({ to: "/app" }))}>Overview</Item>}
                    {can("orders") && <Item icon={<ShoppingBag />} onSelect={() => go(() => navigate({ to: "/app/orders" }))}>Orders</Item>}
                    {can("inbox") && <Item icon={<MessagesSquare />} onSelect={() => go(() => navigate({ to: "/app/inbox" }))}>Inbox</Item>}
                    {can("products") && <Item icon={<Boxes />} onSelect={() => go(() => navigate({ to: "/app/products" }))}>Products</Item>}
                    {can("products") && <Item icon={<FolderTree />} onSelect={() => go(() => navigate({ to: "/app/categories" }))}>Categories</Item>}
                    {can("channels") && <Item icon={<Plug />} onSelect={() => go(() => navigate({ to: "/app/channels" }))}>Channels</Item>}
                    <Item icon={<Settings />} onSelect={() => go(() => navigate({ to: "/app/settings" }))}>Store settings</Item>
                  </Command.Group>
                  <Command.Group heading="Other">
                    {siteUrl && <Item icon={<ExternalLink />} onSelect={() => go(() => window.open(siteUrl, "_blank", "noopener"))}>View your site</Item>}
                    <Item icon={resolved === "dark" ? <Sun /> : <Moon />} onSelect={() => go(() => setTheme(resolved === "dark" ? "light" : "dark"))}>
                      Switch to {resolved === "dark" ? "light" : "dark"} theme
                    </Item>
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Item({ children, icon, onSelect, value }: { children: ReactNode; icon: ReactNode; onSelect: () => void; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-default select-none items-center gap-2.5 rounded-lg px-3 text-sm data-[selected=true]:bg-surface-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3"
    >
      {icon}
      {children}
    </Command.Item>
  );
}
