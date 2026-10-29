import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { Check, Copy, MessageCircle, Minus, MoreHorizontal, Phone, Plus, RefreshCw, Search, Truck, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, buttonStyles } from "~/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "~/components/ui/field";
import { DropdownMenu, MenuItem, MenuSeparator, Sheet } from "~/components/ui/overlay";
import { Badge, cap, ChannelTag, channelLabel, OrderStatusBadge } from "~/components/ui/badge";
import { Segmented, Skeleton } from "~/components/ui/misc";
import { confirmAction } from "~/components/ui/confirm";
import { dateTime, rs } from "~/lib/format";
import { cn } from "~/lib/cn";
import { PROVINCES, SOURCES, type Order, type Product, type StoreSession } from "~/lib/types";
import { api, call } from "~/lib/api";

const NEXT: Record<string, { status: string; label: string; icon: ReactNode } | undefined> = {
  pending: { status: "confirmed", label: "Confirm order", icon: <Check /> },
  confirmed: { status: "shipped", label: "Mark as shipped", icon: <Truck /> },
  shipped: { status: "delivered", label: "Mark as delivered", icon: <Check /> },
};

const waLink = (phone: string) => `https://wa.me/${phone.length === 10 ? "977" : ""}${phone}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-fg-2">{label}</span>
      <span className="tabular text-right">{children}</span>
    </div>
  );
}

const appRoute = getRouteApi("/app");

export function OrderSheet({ orderId, storeUrl, onClose }: { orderId?: string; storeUrl: string; onClose: () => void }) {
  const router = useRouter();
  const canInbox = appRoute.useRouteContext().session.user.features.includes("inbox");
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = (id: string) =>
    call(api.orders[":id"].$get({ param: { id } }))
      .then(setOrder)
      .catch((e) => {
        toast.error(e.message);
        onClose();
      });

  useEffect(() => {
    setOrder(null);
    if (orderId && orderId !== "new") load(orderId);
  }, [orderId]);

  async function update(patch: { status?: string; payment_status?: string }, message: string) {
    if (!order) return;
    setBusy(patch.status ?? patch.payment_status ?? "x");
    try {
      await call(api.orders[":id"].$patch({ param: { id: order.id }, json: patch }));
      toast.success(message);
      await load(order.id);
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function finalStatus(status: "cancelled" | "returned") {
    if (!order) return;
    const ok = await confirmAction({
      title: status === "cancelled" ? `Cancel order #${order.order_number}?` : `Mark #${order.order_number} as returned?`,
      description: "Its items go back into stock. This can't be undone.",
      confirmLabel: status === "cancelled" ? "Cancel order" : "Mark returned",
      danger: true,
    });
    if (ok) update({ status }, status === "cancelled" ? "Order cancelled, stock restored" : "Marked returned, stock restored");
  }

  async function recheck() {
    if (!order) return;
    setBusy("recheck");
    try {
      const r = await call(api.orders[":id"]["recheck-payments"].$post({ param: { id: order.id } }));
      if (r.errors.length) toast.error(r.errors[0]);
      else toast(r.payment_status === "paid" ? "Payment confirmed" : "Not paid yet");
      await load(order.id);
      router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  const next = order ? NEXT[order.status] : undefined;
  const final = order && (order.status === "cancelled" || order.status === "returned");
  const online = order && (order.payment_method === "esewa" || order.payment_method === "khalti");
  const payLink = order?.public_token ? `${storeUrl.startsWith("http") ? storeUrl : location.origin + storeUrl}/order/${order.public_token}` : null;

  return (
    <Sheet
      open={!!orderId && orderId !== "new"}
      onOpenChange={(o) => !o && onClose()}
      title={order ? `Order #${order.order_number}` : "Order"}
      description={order ? dateTime(order.created_at) : undefined}
      width="34rem"
      footer={
        order && (
          <>
            {!final && (
              <DropdownMenu
                align="start"
                trigger={
                  <Button variant="ghost" className="mr-auto" aria-label="More actions">
                    <MoreHorizontal /> More
                  </Button>
                }
              >
                {order.payment_status !== "paid" ? (
                  <MenuItem onClick={() => update({ payment_status: "paid" }, "Marked as paid")}>
                    <Check /> Mark as paid
                  </MenuItem>
                ) : (
                  <MenuItem onClick={() => update({ payment_status: "unpaid" }, "Marked as unpaid")}>
                    <Undo2 /> Mark as unpaid
                  </MenuItem>
                )}
                <MenuSeparator />
                {order.status === "delivered" ? (
                  <MenuItem danger onClick={() => finalStatus("returned")}>
                    <Undo2 /> Mark as returned
                  </MenuItem>
                ) : (
                  <MenuItem danger onClick={() => finalStatus("cancelled")}>
                    <X /> Cancel order
                  </MenuItem>
                )}
              </DropdownMenu>
            )}
            <Button onClick={onClose}>Close</Button>
            {next && (
              <Button variant="primary" loading={busy === next.status} onClick={() => update({ status: next.status }, `Order ${next.status}`)}>
                {next.icon} {next.label}
              </Button>
            )}
          </>
        )
      }
    >
      {!order ? (
        <div className="grid gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Badge tone={order.payment_status === "paid" ? "good" : "neutral"}>
              {cap(order.payment_status)} · {order.payment_method === "cod" ? "Cash on delivery" : order.payment_method.toUpperCase()}
            </Badge>
            <ChannelTag channel={order.source} className="ml-1" />
          </div>

          <section className="rounded-xl border border-border p-4">
            <p className="font-semibold">{order.customer_name}</p>
            <p className="tabular text-sm text-fg-2">{order.customer_phone}</p>
            {(order.address || order.city) && (
              <p className="mt-2 text-sm">
                {[order.address, order.city, order.province].filter(Boolean).join(", ")}
                <span className="block text-xs text-fg-3">{order.inside_valley ? "Inside" : "Outside"} Kathmandu Valley</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:${order.customer_phone}`} className={buttonStyles({ size: "sm" })}>
                <Phone /> Call
              </a>
              <a href={waLink(order.customer_phone)} target="_blank" rel="noopener" className={buttonStyles({ size: "sm" })}>
                <MessageCircle /> WhatsApp
              </a>
              {order.conversation_id && canInbox && (
                <Link to="/app/inbox/$id" params={{ id: order.conversation_id }} className={buttonStyles({ size: "sm", variant: "ghost" })}>
                  Open chat
                </Link>
              )}
            </div>
          </section>

          {order.note && (
            <section className="rounded-xl bg-warn-soft px-4 py-3 text-sm">
              <p className="text-xs font-medium text-warn">Customer note</p>
              <p className="mt-0.5">{order.note}</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Items</h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{it.name}</span>
                    <span className="tabular text-xs text-fg-3">
                      {it.quantity} × {rs(it.price)}
                    </span>
                  </span>
                  <span className="tabular shrink-0">{rs(it.price * it.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 px-1">
              <Row label="Subtotal">{rs(order.subtotal)}</Row>
              <Row label="Delivery">{order.delivery_fee ? rs(order.delivery_fee) : "Free"}</Row>
              {order.discount > 0 && <Row label="Discount">−{rs(order.discount)}</Row>}
              <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular">{rs(order.total)}</span>
              </div>
            </div>
          </section>

          {(online || order.payments.length > 0) && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Online payment</h3>
                <div className="flex gap-1.5">
                  {order.payments.some((p) => p.status === "initiated" || p.status === "pending") && (
                    <Button size="sm" onClick={recheck} loading={busy === "recheck"}>
                      <RefreshCw /> Re-check
                    </Button>
                  )}
                  {payLink && order.payment_status === "unpaid" && !final && (
                    <Button
                      size="sm"
                      onClick={() =>
                        navigator.clipboard.writeText(payLink).then(
                          () => toast.success("Payment link copied", { description: "Send it to the customer on chat." }),
                          () => toast(payLink),
                        )
                      }
                    >
                      <Copy /> Copy payment link
                    </Button>
                  )}
                </div>
              </div>
              {order.payments.length ? (
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="font-medium">{p.provider === "esewa" ? "eSewa" : "Khalti"}</span>
                        {p.mode === "test" && <Badge className="ml-1.5">Test</Badge>}
                        <span className="block truncate text-xs text-fg-3">
                          {dateTime(p.created_at)}
                          {p.provider_txn_id && ` · Ref ${p.provider_txn_id}`}
                        </span>
                      </span>
                      <Badge tone={p.status === "completed" ? "good" : p.status === "failed" || p.status === "mismatch" ? "bad" : p.status === "pending" ? "warn" : "neutral"}>
                        {p.status === "completed" ? "Paid" : cap(p.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-fg-2">
                  The customer hasn't started paying yet. Send them the payment link.
                </p>
              )}
              {order.payments.some((p) => p.status === "mismatch") && (
                <p className="mt-2 text-sm text-bad">One attempt reported a different amount than this order. It was not counted as paid — check it in your gateway dashboard.</p>
              )}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ---- New order ---------------------------------------------------------------------

export type NewOrderPrefill = { customer_name?: string; customer_phone?: string; source?: string; conversation_id?: string };

export function NewOrderSheet({
  open,
  prefill,
  store,
  onClose,
  onCreated,
}: {
  open: boolean;
  prefill?: NewOrderPrefill;
  store: StoreSession["store"];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [lines, setLines] = useState<{ product: Product; quantity: number }[]>([]);
  const [query, setQuery] = useState("");
  const [inside, setInside] = useState("true");
  const [fee, setFee] = useState("");
  const [discount, setDiscount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setQuery("");
    setFee("");
    setDiscount("");
    setError(null);
    call(api.products.options.$get()).then(setProducts).catch(() => setProducts([]));
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !products) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 6);
  }, [query, products]);

  const subtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const defaultFee = store.free_delivery_over != null && subtotal >= store.free_delivery_over ? 0 : inside === "true" ? store.delivery_fee_inside : store.delivery_fee_outside;
  const delivery = fee === "" ? defaultFee : Number(fee) || 0;
  const total = Math.max(0, subtotal + delivery - (Number(discount) || 0));

  function addLine(p: Product) {
    setLines((ls) => {
      const found = ls.find((l) => l.product.id === p.id);
      return found ? ls.map((l) => (l === found ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { product: p, quantity: 1 }];
    });
    setQuery("");
  }
  const setQty = (id: string, q: number) => setLines((ls) => ls.flatMap((l) => (l.product.id !== id ? [l] : q <= 0 ? [] : [{ ...l, quantity: q }])));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lines.length) return setError("Add at least one product");
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      const o = await call(
        api.orders.$post({
          json: {
            ...d,
            inside_valley: inside,
            delivery_fee: fee,
            discount,
            conversation_id: prefill?.conversation_id,
            items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
          },
        }),
      );
      toast.success(`Order #${o.order_number} created`, { description: rs(o.total) });
      onCreated(o.id);
      router.invalidate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="New order"
      description="For orders taken on chat, by phone or in person."
      width="36rem"
      footer={
        <>
          <span className="mr-auto text-sm text-fg-2">
            Total <span className="tabular ml-1 text-base font-semibold text-fg">{rs(total)}</span>
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-order" variant="primary" loading={busy}>
            Create order
          </Button>
        </>
      }
    >
      <form method="post" id="new-order" onSubmit={submit} className="grid gap-6" key={String(open)}>
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Items</h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={products ? "Search products to add" : "Loading products…"}
              className="pl-9"
              aria-label="Search products"
              role="combobox"
              aria-expanded={matches.length > 0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  e.preventDefault();
                  addLine(matches[0]);
                }
              }}
            />
            {matches.length > 0 && (
              <ul role="listbox" className="popover absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-md">
                {matches.map((p) => {
                  const out = p.track_stock && p.stock <= 0;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        disabled={out}
                        onClick={() => addLine(p)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="tabular shrink-0 text-xs text-fg-3">
                          {rs(p.price)} · {p.track_stock ? (out ? "out of stock" : `${p.stock} left`) : "not tracked"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {lines.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {lines.map(({ product: p, quantity }) => {
                const over = p.track_stock && quantity > p.stock;
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className={cn("tabular text-xs", over ? "text-bad" : "text-fg-3")}>{over ? `Only ${p.stock} in stock` : rs(p.price)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Fewer" onClick={() => setQty(p.id, quantity - 1)}>
                        <Minus />
                      </Button>
                      <span className="tabular w-6 text-center text-sm">{quantity}</span>
                      <Button size="icon-sm" variant="ghost" aria-label="More" onClick={() => setQty(p.id, quantity + 1)}>
                        <Plus />
                      </Button>
                    </span>
                    <span className="tabular w-24 text-right text-sm">{rs(p.price * quantity)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-3">Search above to add products.</p>
          )}
        </section>

        <section className="grid gap-4">
          <h3 className="text-sm font-semibold">Customer</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{(p) => <Input {...p} name="customer_name" required maxLength={100} defaultValue={prefill?.customer_name} autoComplete="off" />}</Field>
            <Field label="Phone">
              {(p) => <Input {...p} name="customer_phone" required type="tel" inputMode="tel" placeholder="98XXXXXXXX" defaultValue={prefill?.customer_phone} />}
            </Field>
            <Field label="Province" optional>
              {(p) => (
                <Select {...p} name="province" defaultValue="">
                  <option value="">—</option>
                  {PROVINCES.map((pr) => (
                    <option key={pr}>{pr}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="City" optional>
              {(p) => <Input {...p} name="city" maxLength={80} />}
            </Field>
          </div>
          <Field label="Address / landmark" optional>
            {(p) => <Input {...p} name="address" maxLength={300} />}
          </Field>
        </section>

        <section className="grid gap-4">
          <h3 className="text-sm font-semibold">Delivery & payment</h3>
          <Segmented
            label="Delivery area"
            value={inside}
            onChange={setInside}
            options={[
              { value: "true", label: "Inside valley" },
              { value: "false", label: "Outside valley" },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Delivery fee" hint={fee === "" ? `Default ${rs(defaultFee)}` : undefined}>
              {(p) => <Input {...p} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder={String(defaultFee)} />}
            </Field>
            <Field label="Discount" optional>
              {(p) => <Input {...p} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />}
            </Field>
            <Field label="Payment">
              {(p) => (
                <Select {...p} name="payment_method" defaultValue="cod">
                  <option value="cod">Cash on delivery</option>
                  <option value="cash">Cash (paid)</option>
                  <option value="esewa">eSewa</option>
                  <option value="khalti">Khalti</option>
                  <option value="bank">Bank transfer</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Channel">
              {(p) => (
                <Select {...p} name="source" defaultValue={prefill?.source ?? "walkin"}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {channelLabel(s)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Note" optional>
            {(p) => <Textarea {...p} name="note" rows={2} maxLength={500} />}
          </Field>
        </section>
        <FormError message={error} />
      </form>
    </Sheet>
  );
}
