import { Banknote, MessageCircle, Truck, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { rs } from "~/lib/format";
import { cn } from "~/lib/cn";
import type { PublicStore } from "~/api/routes/storefront";

/** wa.me link for the store's WhatsApp, with an optional prefilled message. 10-digit Nepali mobiles get +977. */
export function waLink(store: Pick<PublicStore, "whatsapp_number">, text?: string) {
  const n = store.whatsapp_number;
  if (!n) return null;
  return `https://wa.me/${n.length === 10 ? "977" : ""}${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function socialLinks(store: PublicStore) {
  const wa = waLink(store);
  return [
    wa && { href: wa, label: "WhatsApp" },
    store.facebook_page && { href: `https://m.me/${store.facebook_page}`, label: "Messenger" },
    store.instagram_handle && { href: `https://instagram.com/${store.instagram_handle}`, label: "Instagram" },
    store.tiktok_handle && { href: `https://www.tiktok.com/@${store.tiktok_handle}`, label: "TikTok" },
  ].filter(Boolean) as { href: string; label: string }[];
}

/** One-line bar above the header: the owner's announcement, else the strongest delivery promise. */
export function announcementFor(store: PublicStore) {
  if (store.announcement) return store.announcement;
  if (store.free_delivery_over != null) return `Free delivery on orders over ${rs(store.free_delivery_over)}${store.cod_enabled ? " · Cash on delivery" : ""}`;
  if (store.cod_enabled) return "Cash on delivery across Nepal";
  return null;
}

/** The reasons to buy here, from the store's real settings. */
export function TrustStrip({ store, className }: { store: PublicStore; className?: string }) {
  const online = [store.esewa_online || store.esewa_id ? "eSewa" : null, store.khalti_online || store.khalti_id ? "Khalti" : null].filter(Boolean);
  const items: { icon: ReactNode; title: string; body: string }[] = [
    {
      icon: <Truck />,
      title: store.free_delivery_over != null ? `Free delivery over ${rs(store.free_delivery_over)}` : "Delivery across Nepal",
      body: `${rs(store.delivery_fee_inside)} inside the Valley, ${rs(store.delivery_fee_outside)} outside`,
    },
    ...(store.cod_enabled ? [{ icon: <Banknote />, title: "Cash on delivery", body: "Pay when your order arrives" }] : []),
    ...(online.length ? [{ icon: <Wallet />, title: `Pay with ${online.join(" or ")}`, body: "Quick and secure" }] : []),
    ...(store.whatsapp_number || store.facebook_page || store.instagram_handle
      ? [{ icon: <MessageCircle />, title: "Real people, quick replies", body: "Ask us anything before you order" }]
      : []),
  ];
  return (
    // Flex rows that grow to fill, so 2, 3 or 4 promises never leave an empty cell.
    <ul className={cn("flex flex-wrap gap-px overflow-hidden rounded-2xl border border-border bg-border", className)}>
      {items.map((it) => (
        <li key={it.title} className="flex flex-1 basis-60 items-start gap-3 bg-surface p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand [&_svg]:size-[18px]" aria-hidden>
            {it.icon}
          </span>
          <span>
            <span className="block text-sm font-semibold">{it.title}</span>
            <span className="block text-sm text-fg-2">{it.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SectionTitle({ eyebrow, title, action, id }: { eyebrow?: string; title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">{eyebrow}</p>}
        <h2 id={id} className="font-display mt-1 text-2xl leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
