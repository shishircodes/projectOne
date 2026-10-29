import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Banknote, Check, ChevronLeft, MessageCircle, Minus, Plus, Share2, ShoppingBag, Truck } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { ProductCard } from "~/components/store/product-card";
import { SectionTitle, waLink } from "~/components/store/bits";
import { Button, buttonStyles } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { useCart } from "~/lib/cart";
import { rs } from "~/lib/format";
import { cn } from "~/lib/cn";
import { api, call, orNotFound } from "~/lib/api";

export const Route = createFileRoute("/s/$slug/p/$product")({
  loader: ({ params }) => orNotFound(call(api.storefront[":slug"].products[":product"].$get({ param: { slug: params.slug, product: params.product } }))),
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    return p
      ? {
          meta: [
            { title: p.name },
            { name: "description", content: p.description.slice(0, 160) },
            { property: "og:title", content: p.name },
            ...(p.images[0] ? [{ property: "og:image", content: p.images[0] }] : []),
          ],
        }
      : {};
  },
  pendingComponent: () => (
    <div className="grid gap-8 md:grid-cols-2">
      <Skeleton className="aspect-[4/5] rounded-3xl" />
      <div className="grid content-start gap-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-11 w-48" />
      </div>
    </div>
  ),
  component: ProductPage,
});

const layout = getRouteApi("/s/$slug");

function ProductPage() {
  const { product: p, related } = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { store } = layout.useLoaderData();
  const navigate = useNavigate();
  const { add, cart } = useCart(slug);
  const [qty, setQty] = useState(1);
  const [slide, setSlide] = useState(0);
  const [added, setAdded] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  const out = p.track_stock && p.stock <= 0;
  const inCart = cart[p.id] ?? 0;
  const max = p.track_stock ? Math.max(0, p.stock - inCart) : 99;
  const images = p.images.length ? p.images : [null];
  const wa = store ? waLink(store, `Namaste! I'd like to order: ${p.name} (${rs(p.price)})`) : null;

  function addToCart() {
    if (max <= 0) return;
    add(p.id, Math.min(qty, max), p.track_stock ? p.stock : 99);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
    toast.success(`Added to cart`, {
      description: `${Math.min(qty, max)} × ${p.name}`,
      action: { label: "View cart", onClick: () => navigate({ to: "/s/$slug/cart", params: { slug } }) },
    });
  }

  async function share() {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  const goTo = (i: number) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" });

  return (
    <>
      <Link to="/s/$slug" params={{ slug }} search={p.category_slug ? { c: p.category_slug } : {}} className="mb-4 inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden /> {p.category_name ?? "All products"}
      </Link>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div>
          {/* Native scroll-snap gallery: the browser's own swipe physics on phones. */}
          <div
            ref={track}
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
            className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-3xl bg-surface-2 [scrollbar-width:none]"
          >
            {images.map((src, i) => (
              <div key={i} className="size-full shrink-0 snap-start">
                {src ? (
                  <img src={src} alt={i === 0 ? p.name : ""} className="size-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
                ) : (
                  <span className="font-display grid size-full place-items-center bg-brand-soft text-7xl text-brand" aria-hidden>
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
          {p.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {p.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => goTo(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-current={slide === i}
                  className={cn("pressable aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-xl border-2", slide === i ? "border-fg" : "border-transparent opacity-70 hover:opacity-100")}
                >
                  <img src={src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="md:sticky md:top-24 md:self-start">
          {p.category_name && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">{p.category_name}</p>}
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1 className="font-display text-3xl leading-[1.08] tracking-[-0.025em] sm:text-4xl">{p.name}</h1>
            <Button variant="ghost" size="icon" shape="pill" onClick={share} aria-label="Share" className="-mr-2 shrink-0">
              <Share2 />
            </Button>
          </div>
          <p className="tabular mt-4 text-2xl">
            <span className="font-semibold">{rs(p.price)}</span>
            {p.compare_at_price && p.compare_at_price > p.price && (
              <>
                <span className="ml-2 text-lg text-fg-3 line-through">{rs(p.compare_at_price)}</span>
                <span className="ml-2 rounded-full bg-brand px-2 py-0.5 align-middle text-xs font-semibold text-brand-ink">
                  Save {rs(p.compare_at_price - p.price)}
                </span>
              </>
            )}
          </p>
          <p className={cn("mt-2 text-sm font-medium", out ? "text-bad" : p.track_stock && p.stock <= p.low_stock_threshold ? "text-warn" : "text-good")}>
            {out ? "Sold out" : p.track_stock && p.stock <= p.low_stock_threshold ? `Only ${p.stock} left` : "In stock"}
          </p>

          {!out && (
            <div className="mt-6 hidden items-center gap-3 md:flex">
              <QtyStepper value={qty} onChange={setQty} max={Math.max(1, max)} />
              <Button variant="primary" size="xl" shape="pill" onClick={addToCart} disabled={max <= 0} className="flex-1">
                {added ? <Check /> : <ShoppingBag />} {max <= 0 ? "All in your cart" : added ? "Added" : "Add to cart"}
              </Button>
            </div>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener" className={cn(buttonStyles({ size: "xl", shape: "pill" }), "mt-3 w-full")}>
              <MessageCircle /> Order on WhatsApp
            </a>
          )}
          {p.description && <div className="mt-8 whitespace-pre-line text-base leading-relaxed text-fg-2">{p.description}</div>}
          {store && (
            <ul className="mt-8 grid gap-4 rounded-2xl bg-surface-2 p-5 text-sm">
              <li className="flex gap-3">
                <Truck className="mt-0.5 size-[18px] shrink-0 text-fg-2" aria-hidden />
                <span>
                  <span className="block font-medium">Delivery across Nepal</span>
                  <span className="text-fg-2">
                    {rs(store.delivery_fee_inside)} inside Kathmandu Valley, {rs(store.delivery_fee_outside)} outside
                    {store.free_delivery_over != null && <>. Free over {rs(store.free_delivery_over)}</>}.
                  </span>
                </span>
              </li>
              {store.cod_enabled && (
                <li className="flex gap-3">
                  <Banknote className="mt-0.5 size-[18px] shrink-0 text-fg-2" aria-hidden />
                  <span>
                    <span className="block font-medium">Cash on delivery</span>
                    <span className="text-fg-2">Pay when your order arrives.</span>
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <SectionTitle eyebrow="More to love" title="You may also like" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} slug={slug} />
            ))}
          </div>
        </section>
      )}

      {/* Phone: sticky purchase bar in thumb reach */}
      {!out && (
        <div className="glass fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-surface/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:hidden">
          <QtyStepper value={qty} onChange={setQty} max={Math.max(1, max)} />
          <Button variant="primary" size="xl" shape="pill" onClick={addToCart} disabled={max <= 0} className="flex-1">
            {added ? <Check /> : <ShoppingBag />} {max <= 0 ? "All in cart" : added ? "Added" : "Add to cart"}
          </Button>
        </div>
      )}
    </>
  );
}

function QtyStepper({ value, onChange, max }: { value: number; onChange: Dispatch<SetStateAction<number>>; max: number }) {
  return (
    <div className="flex h-12 items-center rounded-full border border-border bg-surface px-1">
      <Button variant="ghost" size="icon" shape="pill" aria-label="Fewer" onClick={() => onChange((v) => Math.max(1, v - 1))} disabled={value <= 1}>
        <Minus />
      </Button>
      <span className="tabular w-8 text-center font-medium" aria-live="polite">
        {value}
      </span>
      <Button variant="ghost" size="icon" shape="pill" aria-label="More" onClick={() => onChange((v) => Math.min(max, v + 1))} disabled={value >= max}>
        <Plus />
      </Button>
    </div>
  );
}
