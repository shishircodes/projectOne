import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { MessageCircle, Search, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "~/lib/cart";
import { brandVars } from "~/lib/brand";
import { announcementFor, socialLinks, waLink } from "~/components/store/bits";
import { api, call, orNotFound } from "~/lib/api";
import type { PublicStore } from "~/api/routes/storefront";

export const Route = createFileRoute("/s/$slug")({
  loader: ({ params }) => orNotFound(call(api.storefront[":slug"].$get({ param: { slug: params.slug } }))),
  head: ({ loaderData }) => {
    const s = loaderData?.store;
    if (!s) return { meta: [{ title: loaderData?.closed ? loaderData.name : "Store not found" }] };
    const image = s.banner_url || s.logo_url;
    return {
      meta: [
        { title: s.name },
        { name: "description", content: s.tagline || s.description.slice(0, 160) },
        { property: "og:title", content: s.name },
        { property: "og:description", content: s.tagline },
        ...(image ? [{ property: "og:image", content: image }] : []),
      ],
    };
  },
  component: StoreLayout,
});

function StoreLayout() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();
  if (data.closed || !data.store) {
    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">{data.closed ? data.name : "Store not found"}</h1>
          <p className="mt-2 text-fg-2">{data.closed ? "This store isn't open yet. Please check back soon." : "Check the address and try again."}</p>
        </div>
      </main>
    );
  }
  return <StoreChrome store={data.store} slug={slug} preview={data.preview} />;
}

function StoreChrome({ store, slug, preview }: { store: PublicStore; slug: string; preview: boolean }) {
  const { count } = useCart(slug);
  const navigate = useNavigate();
  const q = useRouterState({ select: (s) => String((s.location.search as { q?: unknown }).q ?? "") });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);

  const social = socialLinks(store);
  const note = announcementFor(store);
  const wa = waLink(store, `Namaste ${store.name}! `);
  // Product and checkout pages have their own bottom actions; keep the chat bubble off them.
  const showChat = !!wa && !/\/(p|cart|order)(\/|$)/.test(path);

  return (
    <div style={brandVars(store.theme_color)} data-font={store.font_style} className="flex min-h-svh flex-col">
      {preview && (
        <div className="bg-warn-soft px-4 py-2 text-center text-sm text-warn">
          Preview — your store isn't published yet. Only you can see this.{" "}
          <Link to="/app/settings" className="font-medium underline">
            Publish it
          </Link>
        </div>
      )}
      {note && <p className="bg-brand px-4 py-2 text-center text-xs font-medium text-brand-ink sm:text-sm">{note}</p>}
      <header className="glass sticky top-0 z-30 border-b border-border bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-6">
          <Link to="/s/$slug" params={{ slug }} search={{}} className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border" />
            ) : (
              <span className="font-display grid size-9 shrink-0 place-items-center rounded-full bg-brand text-lg text-brand-ink">{store.name.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="font-display truncate text-xl leading-none tracking-[-0.02em]">{store.name}</span>
          </Link>
          <form
            role="search"
            className="relative order-3 w-full sm:order-none sm:mx-auto sm:max-w-md sm:flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/s/$slug", params: { slug }, search: term.trim() ? { q: term.trim() } : {} });
            }}
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={`Search ${store.name}`}
              aria-label="Search products"
              enterKeyHint="search"
              className="h-10 w-full rounded-full border border-control-border bg-surface pl-10 pr-4 text-sm outline-none focus:border-accent focus:ring-3 focus:ring-[var(--ring)]"
            />
          </form>
          <Link
            to="/s/$slug/cart"
            params={{ slug }}
            className="pressable relative flex h-10 items-center gap-2 rounded-full px-3 font-medium hover:bg-surface-2"
            aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
          >
            <ShoppingBag className="size-5" aria-hidden />
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <span key={count} className="enter tabular grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold leading-5 text-brand-ink">
                {count}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl tracking-[-0.02em]">{store.name}</p>
            {(store.tagline || store.description) && <p className="mt-2 line-clamp-4 max-w-sm text-sm leading-relaxed text-fg-2">{store.tagline || store.description}</p>}
          </div>
          {(store.address || store.phone || store.email) && (
            <div className="text-sm">
              <p className="font-semibold">Visit or call</p>
              <ul className="mt-3 grid gap-2 text-fg-2">
                {store.address && <li>{store.address}</li>}
                {store.phone && (
                  <li>
                    <a href={`tel:${store.phone}`} className="hover:text-fg">
                      {store.phone}
                    </a>
                  </li>
                )}
                {store.email && (
                  <li>
                    <a href={`mailto:${store.email}`} className="break-all hover:text-fg">
                      {store.email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
          {social.length > 0 && (
            <div className="text-sm">
              <p className="font-semibold">Chat with us</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {social.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener" className="pressable rounded-full border border-border px-3 py-1.5 font-medium hover:border-border-strong">
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-xs text-fg-3 sm:px-6">
          <span>
            © {new Date().getFullYear()} {store.name}
          </span>
          <a href="/privacy" className="hover:text-fg">
            Privacy
          </a>
          <a href="/data-deletion" className="hover:text-fg">
            Data deletion
          </a>
          <span className="sm:ml-auto">Made with NepalShop</span>
        </div>
      </footer>

      {showChat && (
        <a
          href={wa!}
          target="_blank"
          rel="noopener"
          aria-label={`Chat with ${store.name} on WhatsApp`}
          className="pressable fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-brand pl-3.5 pr-4 font-medium text-brand-ink shadow-lg"
        >
          <MessageCircle className="size-5" aria-hidden />
          <span className="text-sm">Chat</span>
        </a>
      )}
    </div>
  );
}
