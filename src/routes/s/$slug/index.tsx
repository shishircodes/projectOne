import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircle } from "lucide-react";
import { z } from "zod";
import { textParam } from "~/lib/search";
import { ProductCard } from "~/components/store/product-card";
import { SectionTitle, TrustStrip, waLink } from "~/components/store/bits";
import { Skeleton } from "~/components/ui/misc";
import type { PublicProduct } from "~/server/services/storefront";
import { cn } from "~/lib/cn";
import { plural } from "~/lib/format";
import { api, call, orNotFound, qs } from "~/lib/api";
import type { PublicStore } from "~/api/routes/storefront";

export const Route = createFileRoute("/s/$slug/")({
  validateSearch: z.object({ q: textParam, c: textParam }),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => orNotFound(call(api.storefront[":slug"].products.$get({ param: { slug: params.slug }, query: qs(deps) }))),
  pendingComponent: () => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/5] rounded-2xl" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/3" />
        </div>
      ))}
    </div>
  ),
  component: StoreHome,
});

const layout = getRouteApi("/s/$slug");
type Category = { name: string; slug: string; count: number; image: string | null };

function StoreHome() {
  const { categories, products } = Route.useLoaderData();
  const { q, c } = Route.useSearch();
  const { slug } = Route.useParams();
  const { store } = layout.useLoaderData();
  if (!store) return null;
  const filtered = !!(q || c);
  const current = categories.find((cat) => cat.slug === c);

  return (
    <>
      {!filtered && (
        <>
          <Hero store={store} products={products} />
          <TrustStrip store={store} className="mt-6" />
          {categories.length >= 2 && categories.some((cat) => cat.image) && <CategoryTiles categories={categories} slug={slug} />}
        </>
      )}

      <section id="shop" aria-labelledby="shop-title" className={cn("scroll-mt-24", filtered ? "pt-2" : "mt-16")}>
        {q ? (
          <SectionTitle id="shop-title" eyebrow="Search" title={products.length ? `${plural(products.length, "result")} for “${q}”` : `Nothing found for “${q}”`} />
        ) : (
          <SectionTitle id="shop-title" eyebrow={current ? `${plural(current.count, "product")}` : "The collection"} title={current?.name ?? "New arrivals"} />
        )}

        {categories.length > 0 && <CategoryChips categories={categories} slug={slug} q={q} c={c} />}

        {products.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} p={p} slug={slug} index={i} />
            ))}
          </div>
        ) : q ? (
          <p className="py-16 text-center text-fg-2">
            Try a different word, or{" "}
            <Link to="/s/$slug" params={{ slug }} search={{}} className="font-medium text-fg underline underline-offset-4">
              see everything
            </Link>
            .
          </p>
        ) : (
          <p className="py-20 text-center text-fg-2">New products are on the way. Check back soon.</p>
        )}
      </section>

      {!filtered && store.description && <About store={store} />}
    </>
  );
}

function Hero({ store, products }: { store: PublicStore; products: PublicProduct[] }) {
  const wa = waLink(store, `Namaste ${store.name}! `);
  // On a photo the buttons go white/glass; on the tinted panel they use the brand color.
  const pill = "pressable inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-medium [&_svg]:size-[18px]";
  const actions = (onPhoto: boolean) => (
    <div className="mt-7 flex flex-wrap gap-3">
      <a href="#shop" className={cn(pill, onPhoto ? "bg-white text-black hover:bg-white/90" : "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover")}>
        Shop now <ArrowRight />
      </a>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener"
          className={cn(pill, onPhoto ? "border border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20" : "border border-border bg-surface text-fg hover:border-border-strong")}
        >
          <MessageCircle /> Chat with us
        </a>
      )}
    </div>
  );

  if (store.banner_url) {
    return (
      <section className="relative -mx-4 -mt-6 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-3xl">
        <img src={store.banner_url} alt="" fetchPriority="high" className="aspect-[4/5] w-full object-cover sm:aspect-[21/9]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent sm:bg-gradient-to-r sm:from-black/70 sm:via-black/30" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:inset-y-0 sm:flex sm:max-w-xl sm:flex-col sm:justify-center sm:p-12">
          {store.address && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{store.address}</p>}
          <h1 className="font-display mt-2 text-[clamp(2.25rem,6vw,4rem)] leading-[1.02] tracking-[-0.03em]">{store.name}</h1>
          {store.tagline && <p className="mt-3 max-w-md text-lg text-white/85">{store.tagline}</p>}
          {actions(true)}
        </div>
      </section>
    );
  }

  // No cover photo: a brand-tinted panel with a mosaic of the newest product photos.
  const photos = products.flatMap((p) => (p.images[0] ? [p.images[0]] : [])).slice(0, 3);
  return (
    <section className="grid items-center gap-8 overflow-hidden rounded-3xl bg-brand-soft p-6 sm:p-10 md:grid-cols-[1.1fr_1fr] md:p-12">
      <div>
        {store.address && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-3">{store.address}</p>}
        <h1 className="font-display mt-2 text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.02] tracking-[-0.03em]">{store.name}</h1>
        {store.tagline && <p className="mt-3 max-w-md text-lg text-fg-2">{store.tagline}</p>}
        {actions(false)}
      </div>
      {photos.length >= 3 && (
        <div className="grid h-72 grid-cols-2 grid-rows-2 gap-3 sm:h-96" aria-hidden>
          <img src={photos[0]} alt="" className="row-span-2 size-full rounded-2xl object-cover shadow-md" />
          <img src={photos[1]} alt="" className="size-full rounded-2xl object-cover shadow-md" />
          <img src={photos[2]} alt="" className="size-full rounded-2xl object-cover shadow-md" />
        </div>
      )}
    </section>
  );
}

function CategoryTiles({ categories, slug }: { categories: Category[]; slug: string }) {
  return (
    <section aria-labelledby="cats-title" className="mt-16">
      <SectionTitle id="cats-title" eyebrow="Browse" title="Shop by category" />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            to="/s/$slug"
            params={{ slug }}
            search={{ c: cat.slug }}
            hash="shop"
            className="group relative block aspect-[3/4] w-40 shrink-0 snap-start overflow-hidden rounded-2xl bg-surface-2 sm:w-auto"
          >
            {cat.image ? (
              <img src={cat.image} alt="" loading="lazy" className="card-photo size-full object-cover" />
            ) : (
              <span className="block size-full bg-brand-soft" />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
            <span className="absolute inset-x-0 bottom-0 p-3.5 text-white">
              <span className="font-display block text-lg leading-tight">{cat.name}</span>
              <span className="text-xs text-white/80">{plural(cat.count, "item")}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CategoryChips({ categories, slug, q, c }: { categories: Category[]; slug: string; q?: string; c?: string }) {
  const chip = (on: boolean) =>
    cn(
      "pressable shrink-0 rounded-full border px-4 py-2 text-sm font-medium",
      on ? "border-transparent bg-fg text-bg" : "border-border bg-surface text-fg-2 hover:border-border-strong hover:text-fg",
    );
  return (
    <nav aria-label="Categories" className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      <Link to="/s/$slug" params={{ slug }} search={q ? { q } : {}} hash="shop" className={chip(!c)} aria-current={!c ? "page" : undefined}>
        All
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          to="/s/$slug"
          params={{ slug }}
          search={{ c: cat.slug, ...(q ? { q } : {}) }}
          hash="shop"
          className={chip(c === cat.slug)}
          aria-current={c === cat.slug ? "page" : undefined}
        >
          {cat.name}
        </Link>
      ))}
    </nav>
  );
}

function About({ store }: { store: PublicStore }) {
  const wa = waLink(store, `Namaste ${store.name}! `);
  return (
    <section aria-labelledby="about-title" className="mt-20 grid gap-6 rounded-3xl border border-border bg-surface p-6 sm:p-10 md:grid-cols-[1fr_1.4fr] md:gap-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">Our story</p>
        <h2 id="about-title" className="font-display mt-1 text-3xl leading-tight tracking-[-0.02em]">
          About {store.name}
        </h2>
      </div>
      <div>
        <p className="whitespace-pre-line text-base leading-relaxed text-fg-2">{store.description}</p>
        {wa && (
          <a href={wa} target="_blank" rel="noopener" className="mt-5 inline-flex items-center gap-1.5 font-medium text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg">
            Say namaste on WhatsApp <ArrowRight className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </section>
  );
}
