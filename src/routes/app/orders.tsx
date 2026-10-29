import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Plus, Search, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { requireFeature } from "~/lib/nav";
import { useEffect, useState } from "react";
import { z } from "zod";
import { textParam } from "~/lib/search";
import { NewOrderSheet, OrderSheet } from "~/components/app/order-sheet";
import { Pagination } from "~/components/app/pagination";
import { ListSkeleton } from "~/components/app/list-skeleton";
import { storeUrl } from "~/components/app/shell";
import { Button } from "~/components/ui/button";
import { Input, Select } from "~/components/ui/field";
import { ChannelTag, channelLabel, OrderStatusBadge } from "~/components/ui/badge";
import { Card, EmptyState, PageHeader, Segmented } from "~/components/ui/misc";
import { plural, relative, rs } from "~/lib/format";
import { ORDER_STATUSES, SOURCES } from "~/lib/types";
import { api, call, qs } from "~/lib/api";

const search = z.object({
  q: textParam,
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  source: z.enum(SOURCES).optional().catch(undefined),
  page: z.number().int().positive().optional().catch(undefined),
  order: textParam, // open sheet: id | "new"
  // Prefill for "new" (from the inbox)
  name: textParam,
  phone: textParam,
  via: textParam,
  chat: textParam,
});

export const Route = createFileRoute("/app/orders")({
  beforeLoad: ({ context }) => requireFeature(context.session, "orders"),
  validateSearch: search,
  loaderDeps: ({ search: { q, status, source, page } }) => ({ q, status, source, page }),
  loader: ({ deps }) => call(api.orders.$get({ query: qs(deps) })),
  head: () => ({ meta: [{ title: "Orders · NepalShop" }] }),
  pendingComponent: () => <ListSkeleton title="Orders" />,
  component: Orders,
});

const app = getRouteApi("/app");

function Orders() {
  const list = Route.useLoaderData();
  const s = Route.useSearch();
  const { session } = app.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const [q, setQ] = useState(s.q ?? "");

  useEffect(() => {
    if ((s.q ?? "") === q) return;
    const t = setTimeout(() => navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }), replace: true }), 250);
    return () => clearTimeout(t);
  }, [q]);

  const setFilter = (patch: Partial<z.infer<typeof search>>) => navigate({ search: (p) => ({ ...p, ...patch, page: undefined }), replace: true });
  const closeSheet = () => navigate({ search: (p) => ({ ...p, order: undefined, name: undefined, phone: undefined, via: undefined, chat: undefined }) });
  const allCount = Object.values(list.counts).reduce((a, b) => a + b, 0);
  const filtered = !!(s.q || s.status || s.source);

  return (
    <>
      <PageHeader
        title="Orders"
        actions={
          <Button variant="primary" onClick={() => navigate({ search: (p) => ({ ...p, order: "new" }) })}>
            <Plus /> New order
          </Button>
        }
      />

      <div className="mb-3 grid gap-2">
        <Segmented
          label="Status"
          value={s.status ?? "all"}
          onChange={(v) => setFilter({ status: v === "all" ? undefined : (v as any) })}
          options={[
            { value: "all", label: "All", count: allCount },
            ...ORDER_STATUSES.map((st) => ({ value: st, label: st.charAt(0).toUpperCase() + st.slice(1), count: list.counts[st] ?? 0 })),
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or order number" className="pl-9" aria-label="Search orders" enterKeyHint="search" />
          </div>
          <Select aria-label="Channel" value={s.source ?? ""} onChange={(e) => setFilter({ source: (e.target.value || undefined) as any })} className="w-44">
            <option value="">All channels</option>
            {SOURCES.map((src) => (
              <option key={src} value={src}>
                {channelLabel(src)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {list.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<SlidersHorizontal />}
              title="No orders match"
              action={
                <Button
                  onClick={() => {
                    setQ("");
                    navigate({ search: {}, replace: true });
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ShoppingBag />}
              title="No orders yet"
              description="Orders from your store appear here automatically. Add orders from chats or phone calls yourself."
              action={
                <Button variant="primary" onClick={() => navigate({ search: (p) => ({ ...p, order: "new" }) })}>
                  <Plus /> New order
                </Button>
              }
            />
          )
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface-2/60 text-xs text-fg-3">
              <tr>
                <th className="py-2.5 pl-4 pr-2 font-medium">Order</th>
                <th className="px-2 font-medium">Customer</th>
                <th className="hidden px-2 font-medium md:table-cell">Channel</th>
                <th className="hidden px-2 font-medium sm:table-cell">Status</th>
                <th className="px-2 text-right font-medium">Total</th>
                <th className="hidden py-2.5 pl-2 pr-4 text-right font-medium lg:table-cell">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.items.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => navigate({ search: (p) => ({ ...p, order: o.id }) })}>
                  <td className="py-3 pl-4 pr-2">
                    <span className="tabular font-medium">#{o.order_number}</span>
                    <span className="block text-xs text-fg-3 lg:hidden">{relative(o.created_at)}</span>
                  </td>
                  <td className="max-w-0 px-2">
                    <p className="truncate font-medium" title={o.customer_name}>
                      {o.customer_name}
                    </p>
                    <p className="tabular truncate text-xs text-fg-3">
                      {o.customer_phone} · {plural(o.item_count, "item")}
                    </p>
                  </td>
                  <td className="hidden px-2 md:table-cell">
                    <ChannelTag channel={o.source} />
                  </td>
                  <td className="hidden px-2 sm:table-cell">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="whitespace-nowrap px-2 text-right">
                    <span className="tabular text-sm font-medium">{rs(o.total)}</span>
                    <span className="block text-xs text-fg-3">{o.payment_status === "paid" ? "Paid" : o.payment_method === "cod" ? "COD" : "Unpaid"}</span>
                  </td>
                  <td className="hidden whitespace-nowrap py-3 pl-2 pr-4 text-right text-sm text-fg-2 lg:table-cell" title={new Date(o.created_at).toLocaleString()}>
                    {relative(o.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={(page) => navigate({ search: (p) => ({ ...p, page }) })} />

      <OrderSheet orderId={s.order} storeUrl={storeUrl(session)} onClose={closeSheet} />
      <NewOrderSheet
        open={s.order === "new"}
        store={session.store}
        prefill={{ customer_name: s.name, customer_phone: s.phone, source: s.via, conversation_id: s.chat }}
        onClose={closeSheet}
        onCreated={(id) => navigate({ search: (p) => ({ ...p, order: id, name: undefined, phone: undefined, via: undefined, chat: undefined }) })}
      />
    </>
  );
}
