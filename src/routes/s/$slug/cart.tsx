import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, buttonStyles } from "~/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "~/components/ui/field";
import { Segmented, Skeleton } from "~/components/ui/misc";
import type { PublicProduct } from "~/server/services/storefront";
import { useCart } from "~/lib/cart";
import { goToPayment } from "~/lib/pay";
import { rs } from "~/lib/format";
import { cn } from "~/lib/cn";
import { PROVINCES } from "~/lib/types";
import { api, call } from "~/lib/api";

export const Route = createFileRoute("/s/$slug/cart")({
  head: () => ({ meta: [{ title: "Your cart" }, { name: "robots", content: "noindex" }] }),
  component: CartPage,
});

const layout = getRouteApi("/s/$slug");

function CartPage() {
  const { slug } = Route.useParams();
  const { store } = layout.useLoaderData();
  const navigate = useNavigate();
  const { cart, set, prune, clear } = useCart(slug);
  const [products, setProducts] = useState<PublicProduct[] | null>(null);
  const [inside, setInside] = useState("true");
  const [method, setMethod] = useState(store?.cod_enabled ? "cod" : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ids = Object.keys(cart);

  useEffect(() => {
    if (!ids.length) return setProducts([]);
    call(api.storefront[":slug"].cart.$get({ param: { slug }, query: { ids: ids.join(",") } }))
      .then((ps) => {
        setProducts(ps);
        prune(ps.map((p) => p.id)); // drop items no longer sold
      })
      .catch(() => setProducts([]));
  }, [ids.join(",")]);

  if (!store) return null;
  const lines = (products ?? []).filter((p) => cart[p.id]).map((p) => ({ p, qty: cart[p.id] }));
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const free = store.free_delivery_over != null && subtotal >= store.free_delivery_over;
  const delivery = free ? 0 : inside === "true" ? store.delivery_fee_inside : store.delivery_fee_outside;
  const total = subtotal + delivery;
  const short = lines.filter((l) => l.p.track_stock && l.qty > l.p.stock);

  const methods = [
    store.cod_enabled && { value: "cod", label: "Cash on delivery", hint: "Pay when it arrives" },
    (store.esewa_online || store.esewa_id) && { value: "esewa", label: "eSewa", hint: store.esewa_online ? "Pay online now" : `Send to ${store.esewa_id}` },
    (store.khalti_online || store.khalti_id) && { value: "khalti", label: "Khalti", hint: store.khalti_online ? "Pay online now" : `Send to ${store.khalti_id}` },
  ].filter(Boolean) as { value: string; label: string; hint: string }[];
  if (!methods.length) methods.push({ value: "cod", label: "Cash on delivery", hint: "Pay when it arrives" });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (short.length) return setError("Some items have less stock than in your cart. Lower the quantity to continue.");
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setError(null);
    setBusy("order");
    try {
      const r = await call(
        api.storefront[":slug"].orders.$post({
          param: { slug },
          json: { ...d, inside_valley: inside, payment_method: method || methods[0].value, items: lines.map((l) => ({ product_id: l.p.id, quantity: l.qty })) },
        }),
      );
      clear();
      if (r.pay) {
        setBusy("pay");
        try {
          await goToPayment(slug, r.token);
          return;
        } catch {
          // Order exists; the order page offers to retry the payment.
        }
      }
      navigate({ to: "/s/$slug/order/$token", params: { slug, token: r.token }, search: { placed: true } });
    } catch (err: any) {
      setError(err.message);
      setBusy(null);
      if (/left|stock|available/i.test(err.message)) call(api.storefront[":slug"].cart.$get({ param: { slug }, query: { ids: ids.join(",") } })).then(setProducts);
    }
  }

  if (products === null) return <Skeleton className="h-64 rounded-2xl" />;
  if (!lines.length)
    return (
      <div className="grid place-items-center py-24 text-center">
        <ShoppingBag className="size-10 text-fg-3" aria-hidden />
        <h1 className="font-display mt-4 text-3xl tracking-[-0.02em]">Your cart is empty</h1>
        <p className="mt-1 text-fg-2">Find something you love.</p>
        <Link to="/s/$slug" params={{ slug }} className={cn(buttonStyles({ variant: "primary", size: "xl", shape: "pill" }), "mt-6")}>
          Continue shopping
        </Link>
      </div>
    );

  return (
    <form method="post" onSubmit={submit} className="grid items-start gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="grid gap-8">
        <section>
          <h1 className="font-display mb-5 text-3xl tracking-[-0.025em] sm:text-4xl">Your cart</h1>
          {store.free_delivery_over != null && (
            <div className="mb-5 rounded-2xl bg-brand-soft p-4">
              <p className="text-sm font-medium">
                {free ? "Your order ships free." : <>You're {rs(store.free_delivery_over - subtotal)} away from free delivery.</>}
              </p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
                <div className="meter h-full rounded-full bg-brand" style={{ transform: `scaleX(${Math.min(1, subtotal / Math.max(1, store.free_delivery_over))})` }} />
              </div>
            </div>
          )}
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {lines.map(({ p, qty }) => {
              const over = p.track_stock && qty > p.stock;
              return (
                <li key={p.id} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link to="/s/$slug/p/$product" params={{ slug, product: p.slug }} className="aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {p.images[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <Link to="/s/$slug/p/$product" params={{ slug, product: p.slug }} className="line-clamp-2 font-medium hover:underline">
                        {p.name}
                      </Link>
                      <button type="button" onClick={() => set(p.id, 0)} className="pressable -m-1 rounded-md p-1 text-fg-3 hover:text-fg" aria-label={`Remove ${p.name}`}>
                        <X className="size-4" />
                      </button>
                    </div>
                    {over && <p className="text-xs text-bad">{p.stock > 0 ? `Only ${p.stock} available` : "Sold out"}</p>}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                      <div className="flex items-center rounded-lg border border-border">
                        <Button variant="ghost" size="icon-sm" aria-label="Fewer" onClick={() => set(p.id, qty - 1)}>
                          <Minus />
                        </Button>
                        <span className="tabular w-7 text-center text-sm">{qty}</span>
                        <Button variant="ghost" size="icon-sm" aria-label="More" onClick={() => set(p.id, qty + 1)} disabled={p.track_stock && qty >= p.stock}>
                          <Plus />
                        </Button>
                      </div>
                      <span className="tabular font-medium">{rs(p.price * qty)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="grid gap-4">
          <h2 className="font-display text-2xl tracking-[-0.02em]">Delivery details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">{(p) => <Input {...p} name="customer_name" required maxLength={100} autoComplete="name" />}</Field>
            <Field label="Mobile number" hint="We'll call to confirm.">
              {(p) => <Input {...p} name="customer_phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" />}
            </Field>
            <Field label="Province">
              {(p) => (
                <Select {...p} name="province" required defaultValue="Bagmati">
                  {PROVINCES.map((pr) => (
                    <option key={pr}>{pr}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="City / municipality">{(p) => <Input {...p} name="city" required maxLength={80} autoComplete="address-level2" />}</Field>
          </div>
          <Field label="Street address or landmark">{(p) => <Input {...p} name="address" required maxLength={300} autoComplete="street-address" />}</Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Delivery area</span>
            <Segmented
              label="Delivery area"
              value={inside}
              onChange={setInside}
              options={[
                { value: "true", label: `Inside Kathmandu Valley · ${rs(store.delivery_fee_inside)}` },
                { value: "false", label: `Outside · ${rs(store.delivery_fee_outside)}` },
              ]}
            />
          </div>
          <Field label="Note for the seller" optional>
            {(p) => <Textarea {...p} name="note" rows={2} maxLength={500} placeholder="Size, colour, best time to call…" />}
          </Field>
        </section>
      </div>

      <aside className="grid gap-4 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-24">
        <h2 className="font-display text-2xl tracking-[-0.02em]">Payment</h2>
        <div role="radiogroup" aria-label="Payment method" className="grid gap-2">
          {methods.map((m) => {
            const on = (method || methods[0].value) === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMethod(m.value)}
                className={cn("pressable flex items-center gap-3 rounded-xl border p-3 text-left", on ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong")}
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2", on ? "border-brand" : "border-border-strong")}>
                  {on && <span className="size-2 rounded-full bg-brand" />}
                </span>
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-fg-3">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <dl className="grid gap-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-2">Subtotal</dt>
            <dd className="tabular">{rs(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-2">Delivery</dt>
            <dd className="tabular">{delivery ? rs(delivery) : "Free"}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{rs(total)}</dd>
          </div>
        </dl>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="xl" shape="pill" loading={!!busy} disabled={!!short.length}>
          {busy === "pay" ? "Opening payment…" : (method || methods[0].value) !== "cod" && store[`${(method || methods[0].value) as "esewa" | "khalti"}_online`] ? `Pay ${rs(total)}` : "Place order"}
        </Button>
      </aside>
    </form>
  );
}
