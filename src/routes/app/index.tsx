import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import NumberFlow from "@number-flow/react";
import { requireFeature } from "~/lib/nav";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, MessagesSquare, PackageX, ShoppingBag } from "lucide-react";
import { useState, type ReactNode } from "react";
import { z } from "zod";
import { BarList, TrendChart } from "~/components/app/charts";
import { Card, CardHeader, PageHeader, Segmented, Skeleton } from "~/components/ui/misc";
import { cap, channelLabel } from "~/components/ui/badge";
import { dayLabel, num, plural, rs, rsShort, TZ } from "~/lib/format";
import { cn } from "~/lib/cn";
import { api, call } from "~/lib/api";

const search = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).catch(30).optional() });

export const Route = createFileRoute("/app/")({
  beforeLoad: ({ context }) => requireFeature(context.session, "analytics"),
  validateSearch: search,
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ deps }) => call(api.store.stats.$get({ query: { days: String(deps.days) } })),
  head: () => ({ meta: [{ title: "Overview · NepalShop" }] }),
  pendingComponent: OverviewSkeleton,
  component: Overview,
});

const RANGES = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "365", label: "12M" },
] as const;

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Overview() {
  const s = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const k = s.kpi;
  const period = s.days === 365 ? "12 months" : `${s.days} days`;
  const firstName = session.user.name.split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Here's how ${session.store.name} did in the last ${period}.`}
        actions={
          <Segmented
            label="Date range"
            value={String(s.days)}
            onChange={(v) => navigate({ search: { days: Number(v) as 7 | 30 | 90 | 365 }, replace: true })}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key numbers">
        <Kpi label="Revenue" value={k.revenue} format="rs" prev={k.prev_revenue} period={period} />
        <Kpi label="Orders" value={k.orders} prev={k.prev_orders} period={period} />
        <Kpi label="Average order" value={Math.round(k.aov)} format="rs" />
        <Kpi label="Gross profit" value={k.gross_profit} format="rs" note={k.revenue ? `${Math.round((k.gross_profit / k.revenue) * 100)}% margin` : undefined} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader
            title={metric === "revenue" ? "Revenue" : "Orders"}
            description="Per day, Nepal time. Cancelled and returned orders excluded."
            action={
              <Segmented
                size="sm"
                label="Chart metric"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "revenue", label: "Revenue" },
                  { value: "orders", label: "Orders" },
                ]}
              />
            }
          />
          <div className="px-2 pb-3 pt-4 sm:px-4">
            <TrendChart
              label={metric === "revenue" ? "Revenue" : "Orders"}
              data={s.daily.map((d) => ({ label: dayLabel(d.day), value: metric === "revenue" ? d.revenue : d.orders }))}
              format={metric === "revenue" ? rs : (n) => plural(n, "order")}
              axisFormat={metric === "revenue" ? rsShort : num}
            />
          </div>
        </Card>
        <Attention unread={k.unread_messages} lowStock={s.lowStock} outOfStock={k.out_of_stock} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Where sales come from" description="Revenue by channel" />
          <div className="p-5">
            <BarList format={rsShort} rows={s.bySource.map((d) => ({ key: d.source, label: channelLabel(d.source), value: d.revenue, hint: plural(d.orders, "order") }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Best sellers" description="By revenue" />
          <div className="p-5">
            <BarList format={rsShort} rows={s.topProducts.map((d) => ({ key: d.name, label: d.name, value: d.revenue, hint: `${num(d.units)} sold` }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Sales by province" />
          <div className="p-5">
            <BarList format={rsShort} rows={s.byProvince.map((d) => ({ key: d.province, label: d.province, value: d.revenue, hint: plural(d.orders, "order") }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Order status" description={`All orders in the last ${period}`} />
          <div className="p-5">
            <BarList
              format={num}
              rows={["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"]
                .map((st) => ({ key: st, label: cap(st), value: s.byStatus.find((b) => b.status === st)?.orders ?? 0 }))
                .filter((r) => r.value > 0)}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, prev, period, format, note }: { label: string; value: number; prev?: number; period?: string; format?: "rs"; note?: string }) {
  const change = prev ? ((value - prev) / prev) * 100 : null;
  const up = (change ?? 0) >= 0;
  return (
    <Card className="p-4">
      <p className="text-sm text-fg-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
        <NumberFlow
          value={value}
          locales="en-IN"
          format={{ maximumFractionDigits: 0 }}
          prefix={format === "rs" ? "Rs. " : undefined}
          className="tabular"
        />
      </p>
      {change !== null ? (
        <p className={cn("mt-1 inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-good" : "text-bad")}>
          {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
          {Math.abs(change).toFixed(1)}%<span className="ml-1 font-normal text-fg-3">vs previous {period}</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-fg-3">{note ?? " "}</p>
      )}
    </Card>
  );
}

const appRoute = getRouteApi("/app");

function Attention({
  unread,
  lowStock,
  outOfStock,
}: {
  unread: number;
  lowStock: { id: string; name: string; stock: number; low_stock_threshold: number }[];
  outOfStock: number;
}) {
  const pendingCount = appRoute.useLoaderData().pending; // nav counts live on the /app loader (0 without Orders)
  const features = appRoute.useRouteContext().session.user.features;
  const can = (f: (typeof features)[number]) => features.includes(f);
  if (!can("inbox")) unread = 0;
  if (!can("products")) {
    outOfStock = 0;
    lowStock = [];
  }
  const items: { to: string; search?: Record<string, string>; icon: ReactNode; title: string; detail: string; tone: string }[] = [];
  if (pendingCount) items.push({ to: "/app/orders", search: { status: "pending" }, icon: <ShoppingBag />, title: plural(pendingCount, "order") + " to confirm", detail: "Call or message to confirm delivery", tone: "text-warn" });
  if (unread) items.push({ to: "/app/inbox", icon: <MessagesSquare />, title: plural(unread, "unread message"), detail: "Customers are waiting for a reply", tone: "text-link" });
  if (outOfStock) items.push({ to: "/app/products", search: { stock: "out" }, icon: <PackageX />, title: plural(outOfStock, "product") + " out of stock", detail: "Hidden from buying until restocked", tone: "text-bad" });
  const low = lowStock.filter((p) => p.stock > 0);
  if (low.length) items.push({ to: "/app/products", search: { stock: "low" }, icon: <AlertTriangle />, title: plural(low.length, "product") + " running low", detail: low.slice(0, 2).map((p) => `${p.name} (${p.stock})`).join(", "), tone: "text-warn" });

  return (
    <Card className="flex flex-col">
      <CardHeader title="Needs attention" />
      {items.length ? (
        <ul className="grid gap-1 p-2">
          {items.map((it) => (
            <li key={it.title}>
              <Link to={it.to} search={it.search as any} className="pressable flex items-center gap-3 rounded-lg p-3 hover:bg-surface-2">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 [&_svg]:size-4", it.tone)}>{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{it.title}</span>
                  <span className="block truncate text-xs text-fg-3">{it.detail}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex-1 px-5 py-8 text-center text-sm text-fg-3">You're all caught up.</p>
      )}
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="mb-5 flex items-end justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[6.5rem] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </>
  );
}
