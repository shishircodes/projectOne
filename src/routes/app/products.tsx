import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Archive, Boxes, MoreHorizontal, PackagePlus, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { requireFeature } from "~/lib/nav";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { textParam } from "~/lib/search";
import { ProductSheet, StockModal } from "~/components/app/product-sheet";
import { Pagination } from "~/components/app/pagination";
import { Button } from "~/components/ui/button";
import { Input, Select } from "~/components/ui/field";
import { Badge, cap } from "~/components/ui/badge";
import { DropdownMenu, MenuItem, MenuSeparator } from "~/components/ui/overlay";
import { Card, EmptyState, PageHeader, Segmented } from "~/components/ui/misc";
import { ListSkeleton } from "~/components/app/list-skeleton";
import { num, plural, rs } from "~/lib/format";
import type { Product } from "~/lib/types";
import { api, call, qs } from "~/lib/api";

const search = z.object({
  q: textParam,
  category: textParam,
  status: z.enum(["current", "active", "draft", "archived"]).optional().catch(undefined),
  stock: z.enum(["low", "out"]).optional().catch(undefined),
  page: z.number().int().positive().optional().catch(undefined),
  product: textParam, // open sheet: id | "new"
});

export const Route = createFileRoute("/app/products")({
  beforeLoad: ({ context }) => requireFeature(context.session, "products"),
  validateSearch: search,
  loaderDeps: ({ search: { product, ...filters } }) => filters,
  loader: async ({ deps }) => {
    const [list, categories] = await Promise.all([call(api.products.$get({ query: qs({ ...deps, status: deps.status ?? "current" }) })), call(api.categories.$get())]);
    return { list, categories };
  },
  head: () => ({ meta: [{ title: "Products · NepalShop" }] }),
  pendingComponent: () => <ListSkeleton title="Products" />,
  component: Products,
});

function StockCell({ p }: { p: Product }) {
  if (!p.track_stock) return <span className="text-sm text-fg-3">Not tracked</span>;
  if (p.stock <= 0) return <Badge tone="bad">Out of stock</Badge>;
  if (p.stock <= p.low_stock_threshold) return <Badge tone="warn">{num(p.stock)} left</Badge>;
  return <span className="tabular text-sm">{num(p.stock)}</span>;
}

function Thumb({ p }: { p: Product }) {
  return p.images?.[0] ? (
    <img src={p.images[0]} alt="" className="size-10 shrink-0 rounded-lg border border-border object-cover" loading="lazy" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-semibold text-fg-3" aria-hidden>
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Products() {
  const { list, categories } = Route.useLoaderData();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const [q, setQ] = useState(s.q ?? "");
  const [stockFor, setStockFor] = useState<Product | null>(null);

  // Debounced search into the URL (shareable, survives reload, Back works).
  useEffect(() => {
    if ((s.q ?? "") === q) return;
    const t = setTimeout(() => navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }), replace: true }), 250);
    return () => clearTimeout(t);
  }, [q]);

  const setFilter = (patch: Partial<z.infer<typeof search>>) => navigate({ search: (p) => ({ ...p, ...patch, page: undefined }), replace: true });
  const open = (product: string) => navigate({ search: (p) => ({ ...p, product }) });
  const filtered = !!(s.q || s.category || s.stock || (s.status && s.status !== "current"));

  async function archive(p: Product) {
    try {
      await call(api.products[":id"].status.$put({ param: { id: p.id }, json: { status: "archived" } }));
      router.invalidate();
      toast(`"${p.name}" archived`, {
        description: "Hidden from your store.",
        action: {
          label: "Undo",
          onClick: async () => {
            await call(api.products[":id"].status.$put({ param: { id: p.id }, json: { status: p.status } }));
            router.invalidate();
          },
        },
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        description={list.total ? plural(list.total, filtered ? "matching product" : "product") : undefined}
        actions={
          <Button variant="primary" onClick={() => open("new")}>
            <Plus /> Add product
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" className="pl-9" aria-label="Search products" enterKeyHint="search" />
        </div>
        <Segmented
          label="Stock"
          value={s.stock ?? "all"}
          onChange={(v) => setFilter({ stock: v === "all" ? undefined : (v as "low" | "out") })}
          options={[
            { value: "all", label: "All" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]}
        />
        <Select aria-label="Category" value={s.category ?? ""} onChange={(e) => setFilter({ category: e.target.value || undefined })} className="w-44">
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={s.status ?? "current"} onChange={(e) => setFilter({ status: e.target.value as any })} className="w-40">
          <option value="current">Active &amp; drafts</option>
          <option value="active">Active</option>
          <option value="draft">Drafts</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {list.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<SlidersHorizontal />}
              title="No products match"
              description="Try a different search or clear the filters."
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
              icon={<Boxes />}
              title="Add your first product"
              description="Photos, price and stock — it takes about a minute. It shows up in your store right away."
              action={
                <Button variant="primary" onClick={() => open("new")}>
                  <PackagePlus /> Add product
                </Button>
              }
            />
          )
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface-2/60 text-xs font-medium text-fg-3">
              <tr>
                <th className="py-2.5 pl-4 pr-2 font-medium">Product</th>
                <th className="hidden px-2 font-medium md:table-cell">Category</th>
                <th className="px-2 text-right font-medium">Price</th>
                <th className="hidden px-2 text-right font-medium sm:table-cell">Stock</th>
                <th className="hidden px-2 font-medium lg:table-cell">Status</th>
                <th className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.items.map((p) => (
                <tr key={p.id} className="group cursor-pointer hover:bg-surface-2/60" onClick={() => open(p.id)}>
                  <td className="py-2.5 pl-4 pr-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Thumb p={p} />
                      <div className="min-w-0">
                        <p className="truncate font-medium" title={p.name}>
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-fg-3">
                          {p.sku ? `SKU ${p.sku}` : " "}
                          <span className="sm:hidden">
                            {" · "}
                            <StockCell p={p} />
                          </span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-2 text-sm text-fg-2 md:table-cell">{p.category_name ?? <span className="text-fg-3">—</span>}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    <span className="tabular text-sm font-medium">{rs(p.price)}</span>
                    {p.compare_at_price && <span className="tabular block text-xs text-fg-3 line-through">{rs(p.compare_at_price)}</span>}
                  </td>
                  <td className="hidden px-2 text-right sm:table-cell">
                    <StockCell p={p} />
                  </td>
                  <td className="hidden px-2 lg:table-cell">
                    <Badge tone={p.status === "active" ? "good" : "neutral"} dot={p.status === "active"}>
                      {cap(p.status)}
                    </Badge>
                  </td>
                  <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}>
                          <MoreHorizontal />
                        </Button>
                      }
                    >
                      <MenuItem onClick={() => open(p.id)}>
                        <Pencil /> Edit
                      </MenuItem>
                      {p.track_stock && (
                        <MenuItem onClick={() => setStockFor(p)}>
                          <Boxes /> Adjust stock
                        </MenuItem>
                      )}
                      {p.status !== "archived" && (
                        <>
                          <MenuSeparator />
                          <MenuItem onClick={() => archive(p)}>
                            <Archive /> Archive
                          </MenuItem>
                        </>
                      )}
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={(page) => navigate({ search: (p) => ({ ...p, page }) })} />

      <ProductSheet productId={s.product} categories={categories} onClose={() => navigate({ search: (p) => ({ ...p, product: undefined }) })} />
      <StockModal product={stockFor} onClose={() => setStockFor(null)} />
    </>
  );
}
