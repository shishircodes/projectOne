import { useRouter } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "~/components/ui/field";
import { Modal, Sheet } from "~/components/ui/overlay";
import { Skeleton } from "~/components/ui/misc";
import { confirmAction } from "~/components/ui/confirm";
import { ImagePicker } from "./image-picker";
import { dateTime, rs } from "~/lib/format";
import type { Category, Product, StockMovement } from "~/lib/types";
import { cn } from "~/lib/cn";
import { api, call } from "~/lib/api";

const EMPTY: Partial<Product> = { name: "", description: "", price: undefined, stock: 0, low_stock_threshold: 5, track_stock: true, images: [], status: "active" };

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border pb-6 last:border-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Create or edit a product. `productId` = "new" | id | undefined (closed). */
export function ProductSheet({ productId, categories, onClose }: { productId?: string; categories: Category[]; onClose: () => void }) {
  const router = useRouter();
  const open = !!productId;
  const isNew = productId === "new";
  const [product, setProduct] = useState<Partial<Product> | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [track, setTrack] = useState(true);

  useEffect(() => {
    setError(null);
    if (!productId) return;
    if (isNew) {
      setProduct(EMPTY);
      setImages([]);
      setPrice("");
      setCost("");
      setTrack(true);
      return;
    }
    setProduct(null);
    call(api.products[":id"].$get({ param: { id: productId! } }))
      .then((p) => {
        setProduct(p);
        setImages(p.images ?? []);
        setPrice(String(p.price));
        setCost(p.cost_price == null ? "" : String(p.cost_price));
        setTrack(p.track_stock);
      })
      .catch((e) => {
        toast.error(e.message);
        onClose();
      });
  }, [productId]);

  const margin = Number(price) > 0 && cost !== "" ? Math.round(((Number(price) - Number(cost)) / Number(price)) * 100) : null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const input = {
        name: d.name,
        description: d.description,
        sku: d.sku,
        price: d.price,
        compare_at_price: d.compare_at_price,
        cost_price: d.cost_price,
        stock: track ? d.stock : product?.stock ?? 0,
        low_stock_threshold: d.low_stock_threshold,
        track_stock: track,
        status: d.status,
        category_id: d.category_id || null,
        images,
      };
      const saved = isNew
        ? await call(api.products.$post({ json: input }))
        : await call(api.products[":id"].$put({ param: { id: productId! }, json: input }));
      toast.success(isNew ? `"${saved.name}" added` : "Changes saved");
      onClose();
      router.invalidate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!product?.id) return;
    const ok = await confirmAction({
      title: `Delete "${product.name}"?`,
      description: "This can't be undone. Past orders keep their item details. To hide it from your store instead, set its status to Archived.",
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    try {
      await call(api.products[":id"].$delete({ param: { id: product.id } }));
      toast.success("Product deleted");
      onClose();
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "New product" : product?.name || "Edit product"}
      width="36rem"
      footer={
        <>
          {!isNew && product?.id && (
            <Button variant="ghost" className="mr-auto text-bad" onClick={remove}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="product-form" variant="primary" loading={saving} disabled={!product}>
            {isNew ? "Add product" : "Save"}
          </Button>
        </>
      }
    >
      {!product ? (
        <div className="grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-9" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <form method="post" id="product-form" onSubmit={submit} className="grid gap-6" key={productId}>
          <Section title="Photos" description="Up to 8. The first one is shown in your store. Drag images here.">
            <ImagePicker value={images} onChange={setImages} />
          </Section>

          <Section title="Details">
            <Field label="Name">{(p) => <Input {...p} name="name" required maxLength={200} defaultValue={product.name} autoFocus={isNew} />}</Field>
            <Field label="Description" optional hint="Size, material, care — what a customer would ask on chat.">
              {(p) => <Textarea {...p} name="description" rows={4} maxLength={5000} defaultValue={product.description} />}
            </Field>
          </Section>

          <Section title="Pricing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (Rs.)">
                {(p) => <Input {...p} name="price" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />}
              </Field>
              <Field label="Compare-at price" optional hint="Shown crossed out, as a sale.">
                {(p) => <Input {...p} name="compare_at_price" inputMode="decimal" defaultValue={product.compare_at_price ?? ""} />}
              </Field>
              <Field
                label="Cost price"
                optional
                hint={margin !== null ? <span className={cn(margin < 0 ? "text-bad" : "text-good")}>{margin}% margin · {rs(Number(price) - Number(cost))} profit each</span> : "Only you see this. Used for profit."}
              >
                {(p) => <Input {...p} name="cost_price" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />}
              </Field>
            </div>
          </Section>

          <Section title="Inventory">
            <Checkbox label="Track stock" hint="Stock goes down with every order and the product can't be oversold." checked={track} onChange={(e) => setTrack(e.target.checked)} />
            <div className="grid gap-4 sm:grid-cols-3">
              {track && (
                <>
                  <Field label="In stock" hint={isNew ? undefined : "Changes are logged."}>
                    {(p) => <Input {...p} name="stock" inputMode="numeric" defaultValue={product.stock ?? 0} />}
                  </Field>
                  <Field label="Alert below">{(p) => <Input {...p} name="low_stock_threshold" inputMode="numeric" defaultValue={product.low_stock_threshold ?? 5} />}</Field>
                </>
              )}
              <Field label="SKU" optional>
                {(p) => <Input {...p} name="sku" maxLength={64} defaultValue={product.sku ?? ""} autoCapitalize="characters" spellCheck={false} />}
              </Field>
            </div>
          </Section>

          <Section title="Organisation">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                {(p) => (
                  <Select {...p} name="category_id" defaultValue={product.category_id ?? ""}>
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Status" hint="Only active products appear in your store.">
                {(p) => (
                  <Select {...p} name="status" defaultValue={product.status}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <FormError message={error} />
        </form>
      )}
    </Sheet>
  );
}

const REASONS: Record<string, string> = {
  initial: "Opening stock",
  restock: "Restocked",
  sale: "Sold",
  cancel: "Order cancelled",
  return: "Returned",
  adjust: "Adjusted",
  damage: "Damaged or lost",
};

/** Quick stock adjustment with +/- steppers and a full movement history. */
export function StockModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const router = useRouter();
  const [change, setChange] = useState(0);
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<StockMovement[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChange(0);
    setNote("");
    setReason("restock");
    setHistory(null);
    if (product) call(api.products[":id"].stock.$get({ param: { id: product.id } })).then(setHistory).catch(() => setHistory([]));
  }, [product?.id]);

  const next = (product?.stock ?? 0) + (reason === "damage" ? -Math.abs(change) : change);

  async function save() {
    if (!product || !change) return;
    setBusy(true);
    try {
      const r = await call(api.products[":id"].stock.$post({ param: { id: product.id }, json: { change, reason, note } }));
      toast.success(`${product.name}: ${r.stock} in stock`);
      onClose();
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!product} onOpenChange={(o) => !o && onClose()} title="Adjust stock" description={product?.name}>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 p-4">
        <div>
          <p className="text-xs text-fg-3">Now</p>
          <p className="tabular text-2xl font-semibold">{product?.stock}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" aria-label="Remove one" onClick={() => setChange((c) => c - 1)}>
            <Minus />
          </Button>
          <Input
            aria-label="Change"
            inputMode="numeric"
            className="tabular w-20 text-center"
            value={change > 0 ? `+${change}` : String(change)}
            onChange={(e) => setChange(Number(e.target.value.replace(/[^\d-]/g, "")) || 0)}
          />
          <Button size="icon" aria-label="Add one" onClick={() => setChange((c) => c + 1)}>
            <Plus />
          </Button>
        </div>
        <div className="text-right">
          <p className="text-xs text-fg-3">After</p>
          <p className={cn("tabular text-2xl font-semibold", next < 0 && "text-bad")}>{next}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reason">
          {(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="restock">Restock from supplier</option>
              <option value="adjust">Count correction</option>
              <option value="damage">Damaged or lost</option>
              <option value="return">Customer return</option>
            </Select>
          )}
        </Field>
        <Field label="Note" optional>
          {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. From Bhaktapur supplier" />}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy} disabled={!change || next < 0}>
          Update stock
        </Button>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">History</h3>
        <div className="max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-border">
          {!history ? (
            <Skeleton className="m-3 h-16" />
          ) : history.length ? (
            <ul className="divide-y divide-border text-sm">
              {history.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p>
                      {REASONS[m.reason] ?? m.reason}
                      {m.order_number && <span className="text-fg-3"> · #{m.order_number}</span>}
                    </p>
                    <p className="truncate text-xs text-fg-3">
                      {dateTime(m.created_at)}
                      {m.note && ` · ${m.note}`}
                    </p>
                  </div>
                  <span className={cn("tabular font-medium", m.change > 0 ? "text-good" : "text-fg-2")}>
                    {m.change > 0 ? "+" : ""}
                    {m.change}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-fg-3">No changes yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
