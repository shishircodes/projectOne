import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import type { PublicProduct } from "~/server/services/storefront";
import { rs } from "~/lib/format";
import { cn } from "~/lib/cn";

/** `index` staggers the first screen of a grid on load; omit it for cards that shouldn't animate. */
export function ProductCard({ p, slug, index }: { p: PublicProduct; slug: string; index?: number }) {
  const out = p.track_stock && p.stock <= 0;
  const sale = !!p.compare_at_price && p.compare_at_price > p.price && !out;
  const low = !out && p.track_stock && p.stock <= p.low_stock_threshold;
  const [first, second] = p.images ?? [];
  return (
    <Link
      to="/s/$slug/p/$product"
      params={{ slug, product: p.slug }}
      preload="intent"
      className={cn("group block rounded-2xl outline-offset-4", index !== undefined && "rise")}
      style={index !== undefined ? ({ "--i": index } as CSSProperties) : undefined}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-2">
        {first ? (
          <>
            <img src={first} alt={p.name} loading="lazy" decoding="async" className={cn("card-photo size-full object-cover", out && "opacity-60 grayscale-[40%]")} />
            {second && !out && <img src={second} alt="" loading="lazy" decoding="async" className="card-alt card-photo absolute inset-0 size-full object-cover" />}
          </>
        ) : (
          <span className="font-display grid size-full place-items-center bg-brand-soft text-5xl text-brand" aria-hidden>
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {(out || sale || low) && (
          <span
            className={cn(
              "absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm",
              out ? "bg-black/75 text-white" : sale ? "bg-brand text-brand-ink" : "bg-surface/90 text-fg backdrop-blur",
            )}
          >
            {out ? "Sold out" : sale ? `${Math.round((1 - p.price / p.compare_at_price!) * 100)}% off` : `Only ${p.stock} left`}
          </span>
        )}
      </div>
      <div className="mt-3 px-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-fg group-hover:underline group-hover:decoration-border-strong group-hover:underline-offset-4">{p.name}</p>
        <p className="tabular mt-1 text-sm">
          <span className="font-semibold">{rs(p.price)}</span>
          {sale && <span className="ml-1.5 text-fg-3 line-through">{rs(p.compare_at_price!)}</span>}
        </p>
      </div>
    </Link>
  );
}
