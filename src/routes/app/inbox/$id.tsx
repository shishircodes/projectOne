import { createFileRoute, getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Plus, SendHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, buttonStyles } from "~/components/ui/button";
import { ChannelTag, OrderStatusBadge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/misc";
import { storeUrl } from "~/components/app/shell";
import { dateOnly, rs, timeOnly, TZ } from "~/lib/format";
import { cn } from "~/lib/cn";
import type { Message } from "~/lib/types";
import { api, call, orNotFound } from "~/lib/api";

export const Route = createFileRoute("/app/inbox/$id")({
  loader: ({ params }) => orNotFound(call(api.conversations[":id"].$get({ param: { id: params.id } }))),
  pendingComponent: () => (
    <div className="grid gap-3 p-4">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="ml-auto h-10 w-1/3" />
      <Skeleton className="h-10 w-2/3" />
    </div>
  ),
  component: Thread,
});

const app = getRouteApi("/app");
const dayKey = (d: string) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });

type Pending = Message & { pending?: boolean };

function Thread() {
  const { conversation: c, messages, orders } = Route.useLoaderData();
  const { session } = app.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [optimistic, setOptimistic] = useState<Pending[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Server data replaces optimistic bubbles once it includes them.
  useEffect(() => setOptimistic([]), [messages]);
  const all: Pending[] = [...messages, ...optimistic];

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [all.length, c.id]);

  useEffect(() => {
    setText("");
    input.current?.focus({ preventScroll: true });
  }, [c.id]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    const temp: Pending = { id: `tmp-${Date.now()}`, direction: "out", body, status: "sent", error: null, created_at: new Date().toISOString(), pending: true };
    setOptimistic((o) => [...o, temp]);
    setText("");
    try {
      const m = await call(api.conversations[":id"].replies.$post({ param: { id: String(c.id) }, json: { text: body } }));
      if (m.status === "failed") toast.error("Message not delivered", { description: m.error ?? undefined });
      router.invalidate();
    } catch (err: any) {
      setOptimistic((o) => o.filter((x) => x.id !== temp.id));
      setText(body); // give it back so nothing is lost
      toast.error(err.message);
    }
  }

  const store = session.store;
  const isTest = c.external_user_id.startsWith("test-");
  const phone = c.channel === "whatsapp" && !isTest ? c.external_user_id.replace(/^977/, "") : isTest ? c.external_user_id.slice(5).replace(/\D/g, "") : "";
  const site = storeUrl(session);
  const quickReplies = [
    { label: "Delivery charges", text: `Delivery inside Kathmandu Valley is ${rs(store.delivery_fee_inside)} and outside the valley ${rs(store.delivery_fee_outside)}.${store.free_delivery_over ? ` Free delivery on orders over ${rs(store.free_delivery_over)}.` : ""} It usually takes 1–3 days.` },
    {
      label: "Payment options",
      text: `You can pay ${[store.cod_enabled && "cash on delivery", (store.esewa_online || store.esewa_id) && "eSewa", (store.khalti_online || store.khalti_id) && "Khalti"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " or $1")}.`,
    },
    { label: "Shop link", text: `You can see everything and order directly here: ${site.startsWith("http") ? site : (typeof location !== "undefined" ? location.origin : "") + site}` },
    { label: "Thank you", text: "Dhanyabad! 🙏 We'll confirm your order shortly." },
  ];

  return (
    <div className="flex h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] min-h-0 flex-col lg:h-full">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <Link to="/app/inbox" className={cn(buttonStyles({ variant: "ghost", size: "icon-sm" }), "lg:hidden")} aria-label="Back to conversations">
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.customer_name || c.external_user_id}</p>
          <div className="flex items-center gap-2 text-xs text-fg-3">
            <ChannelTag channel={c.channel} />
            {isTest && <span>· test conversation</span>}
          </div>
        </div>
        {session.user.features.includes("orders") && (
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              navigate({
                to: "/app/orders",
                search: { order: "new", name: c.customer_name ?? undefined, phone: phone || undefined, via: c.channel, chat: String(c.id) },
              })
            }
          >
            <Plus /> Create order
          </Button>
          )}
      </header>

      {orders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 [scrollbar-width:none]">
          {orders.map((o) => (
            <Link
              key={o.id}
              to="/app/orders"
              search={{ order: String(o.id) }}
              className="pressable flex shrink-0 items-center gap-2 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
            >
              <span className="tabular font-medium">#{o.order_number}</span>
              <OrderStatusBadge status={o.status} />
              <span className="tabular text-fg-2">{rs(o.total)}</span>
            </Link>
          ))}
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg px-3 py-4 sm:px-5" aria-live="polite">
        {all.map((m, i) => {
          const newDay = i === 0 || dayKey(all[i - 1].created_at) !== dayKey(m.created_at);
          const out = m.direction === "out";
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-fg-3">{dateOnly(m.created_at)}</span>
                </div>
              )}
              <div className={cn("mb-1.5 flex", out ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed sm:max-w-[70%]",
                    out ? "rounded-br-md bg-accent text-white" : "rounded-bl-md border border-border bg-surface",
                    (m as Pending).pending && "opacity-70",
                    i >= messages.length && "enter",
                  )}
                >
                  {m.body}
                  <span className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", out ? "text-white/75" : "text-fg-3")}>
                    {timeOnly(m.created_at)}
                    {out && ((m as Pending).pending ? <Loader2 className="size-3 animate-spin" aria-label="Sending" /> : m.status === "test" ? " · test" : m.status === "failed" ? " · not delivered" : " · sent")}
                  </span>
                </div>
              </div>
              {m.status === "failed" && m.error && <p className="mb-2 text-right text-xs text-bad">{m.error}</p>}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
        <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {quickReplies.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => {
                setText((t) => (t ? `${t} ${r.text}` : r.text));
                input.current?.focus();
              }}
              className="pressable shrink-0 rounded-full border border-border px-3 py-1 text-xs text-fg-2 hover:border-border-strong hover:text-fg"
            >
              {r.label}
            </button>
          ))}
        </div>
        <form method="post" onSubmit={send} className="flex items-end gap-2">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Write a reply…  (Enter to send, Shift+Enter for a new line)"
            aria-label="Reply"
            enterKeyHint="send"
            className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-control-border bg-surface px-3.5 py-2 text-sm [field-sizing:content] focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)]"
          />
          <Button type="submit" variant="primary" size="icon" aria-label="Send" disabled={!text.trim()}>
            <SendHorizontal />
          </Button>
        </form>
      </div>
    </div>
  );
}
