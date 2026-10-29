import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Button, buttonStyles } from "~/components/ui/button";
import { FormError } from "~/components/ui/field";
import { cap } from "~/components/ui/badge";
import { goToPayment } from "~/lib/pay";
import { dateTime, rs } from "~/lib/format";
import { cn } from "~/lib/cn";
import { api, call, orNotFound } from "~/lib/api";

export const Route = createFileRoute("/s/$slug/order/$token")({
  validateSearch: z.object({ placed: z.boolean().optional().catch(undefined), r: z.string().optional().catch(undefined) }),
  loader: ({ params }) => orNotFound(call(api.storefront[":slug"].orders[":token"].$get({ param: { slug: params.slug, token: params.token } }))),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `Order #${loaderData.order.order_number}` : "Order" }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }],
  }),
  component: OrderStatus,
});

const layout = getRouteApi("/s/$slug");
const STEPS = ["pending", "confirmed", "shipped", "delivered"] as const;
const PAY_LABEL: Record<string, string> = { cod: "Cash on delivery", cash: "Cash", esewa: "eSewa", khalti: "Khalti", bank: "Bank transfer" };

function OrderStatus() {
  const { order: o, items, online, lastAttempt } = Route.useLoaderData();
  const { placed, r } = Route.useSearch();
  const { slug, token } = Route.useParams();
  const { store } = layout.useLoaderData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = o.status === "cancelled" || o.status === "returned";
  const step = STEPS.indexOf(o.status as any);
  const method = PAY_LABEL[o.payment_method] ?? o.payment_method;
  const manualId = o.payment_method === "esewa" ? store?.esewa_id : o.payment_method === "khalti" ? store?.khalti_id : null;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await goToPayment(slug, token);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div className="text-center">
        {placed || o.payment_status === "paid" ? (
          <CheckCircle2 className="mx-auto size-12 text-good" aria-hidden />
        ) : (
          <Clock className="mx-auto size-12 text-fg-3" aria-hidden />
        )}
        <h1 className="font-display mt-3 text-3xl tracking-[-0.025em]">{placed ? "Thank you! Your order is placed." : `Order #${o.order_number}`}</h1>
        <p className="mt-1 text-fg-2">
          {placed ? `Order #${o.order_number} · ` : ""}
          {dateTime(o.created_at)}
        </p>
      </div>

      {!closed ? (
        <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
          {STEPS.map((s, i) => (
            <li key={s} className="grid gap-1.5 text-center text-xs">
              <span className={cn("h-1.5 rounded-full", i <= step ? "bg-brand" : "bg-surface-3")} />
              <span className={i <= step ? "font-medium" : "text-fg-3"} aria-current={i === step ? "step" : undefined}>
                {cap(s)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl bg-bad-soft px-4 py-3 text-center text-sm text-bad">This order was {o.status}.</p>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Payment</h2>
        {o.payment_status === "paid" ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-good">
            <CheckCircle2 className="size-4" aria-hidden /> Paid with {method}
            {o.payment_ref && <span className="text-fg-3">· Ref {o.payment_ref}</span>}
          </p>
        ) : o.payment_status === "refunded" ? (
          <p className="mt-2 text-sm text-fg-2">Refunded.</p>
        ) : closed ? (
          <p className="mt-2 text-sm text-fg-2">No payment needed.</p>
        ) : online ? (
          <div className="mt-2 grid gap-3">
            <p className="text-sm text-fg-2">
              {lastAttempt === "pending"
                ? `${method} hasn't confirmed this payment yet. If you already paid, refresh in a minute. If you didn't finish, pay again below.`
                : lastAttempt === "mismatch"
                  ? "There was a problem with this payment. The store will contact you."
                  : r === "error"
                    ? "We couldn't confirm the payment yet. If money left your account, refresh this page shortly or contact the store."
                    : lastAttempt === "failed"
                      ? "The payment wasn't completed. You can try again."
                      : "Complete your payment to confirm the order."}
            </p>
            {lastAttempt !== "mismatch" && (
              <Button variant="primary" size="lg" onClick={pay} loading={busy}>
                Pay {rs(o.total)} with {method}
              </Button>
            )}
            <FormError message={error} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-fg-2">
            {o.payment_method === "cod"
              ? `Please keep ${rs(o.total)} ready when your order arrives.`
              : manualId
                ? `Please send ${rs(o.total)} to ${method} ID ${manualId} and mention order #${o.order_number}.`
                : `Payment: ${method}.`}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-semibold">Summary</h2>
        <ul className="grid gap-2 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0">
                {it.name} <span className="text-fg-3">× {it.quantity}</span>
              </span>
              <span className="tabular shrink-0">{rs(it.price * it.quantity)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-border pt-2 text-fg-2">
            <span>Delivery</span>
            <span className="tabular">{o.delivery_fee ? rs(o.delivery_fee) : "Free"}</span>
          </li>
          <li className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular">{rs(o.total)}</span>
          </li>
        </ul>
        <p className="mt-4 text-sm text-fg-2">Delivering to {[o.address, o.city, o.province].filter(Boolean).join(", ")}</p>
      </section>

      <p className="text-center text-sm text-fg-3">Bookmark this page to check your order later.</p>
      <Link to="/s/$slug" params={{ slug }} className={cn(buttonStyles({ size: "lg" }), "justify-self-center")}>
        Continue shopping
      </Link>
    </div>
  );
}
