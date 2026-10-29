import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { requireFeature } from "~/lib/nav";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Field, FormError, Input, Select } from "~/components/ui/field";
import { DropdownMenu, MenuItem, MenuSeparator, Modal } from "~/components/ui/overlay";
import { Card, EmptyState, PageHeader } from "~/components/ui/misc";
import { confirmAction } from "~/components/ui/confirm";
import { ListSkeleton } from "~/components/app/list-skeleton";
import { plural } from "~/lib/format";
import type { Category } from "~/lib/types";
import { api, call } from "~/lib/api";

export const Route = createFileRoute("/app/categories")({
  beforeLoad: ({ context }) => requireFeature(context.session, "products"),
  loader: () => call(api.categories.$get()),
  head: () => ({ meta: [{ title: "Categories · NepalShop" }] }),
  pendingComponent: () => <ListSkeleton title="Categories" />,
  component: Categories,
});

function Categories() {
  const categories = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await call(api.categories.$post({ json: { name } }));
      setName("");
      router.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(c: Category) {
    const ok = await confirmAction({
      title: `Delete "${c.name}"?`,
      description: c.product_count
        ? `Its ${plural(c.product_count, "product")} won't be deleted; they'll just have no category.`
        : "This category has no products.",
      confirmLabel: "Delete category",
      danger: true,
    });
    if (!ok) return;
    try {
      await call(api.categories[":id"].$delete({ param: { id: c.id } }));
      toast.success("Category deleted");
      router.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const parentName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  return (
    <>
      <PageHeader title="Categories" description="Group products so customers can browse your store by type." />

      <form method="post" onSubmit={add} className="mb-3 flex max-w-xl gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Kurta Suruwal" aria-label="New category name" maxLength={80} enterKeyHint="done" />
        <Button type="submit" variant="primary" loading={adding} disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>

      <Card className="max-w-3xl overflow-hidden">
        {categories.length === 0 ? (
          <EmptyState icon={<FolderTree />} title="No categories yet" description="Add one above. Categories appear as filters at the top of your store." />
        ) : (
          <ul className="divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  {c.parent_id && <p className="text-xs text-fg-3">in {parentName(c.parent_id)}</p>}
                </div>
                <Link
                  to="/app/products"
                  search={{ category: c.id }}
                  className="tabular shrink-0 rounded-md px-2 py-1 text-sm text-fg-2 hover:bg-surface-2 hover:text-fg"
                >
                  {plural(c.product_count, "product")}
                </Link>
                <DropdownMenu
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                      <MoreHorizontal />
                    </Button>
                  }
                >
                  <MenuItem onClick={() => setEditing(c)}>
                    <Pencil /> Rename or move
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onClick={() => remove(c)}>
                    <Trash2 /> Delete
                  </MenuItem>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditCategory category={editing} categories={categories} onClose={() => setEditing(null)} />
    </>
  );
}

function EditCategory({ category, categories, onClose }: { category: Category | null; categories: Category[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) return;
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      await call(api.categories[":id"].$put({ param: { id: category.id }, json: { name: d.name, parent_id: d.parent_id || null, sort: d.sort } }));
      toast.success("Category saved");
      onClose();
      router.invalidate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!category} onOpenChange={(o) => !o && onClose()} title="Edit category">
      {category && (
        <form method="post" onSubmit={submit} className="grid gap-4" key={category.id}>
          <Field label="Name">{(p) => <Input {...p} name="name" defaultValue={category.name} required maxLength={80} autoFocus />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inside">
              {(p) => (
                <Select {...p} name="parent_id" defaultValue={category.parent_id ?? ""}>
                  <option value="">Top level</option>
                  {categories
                    .filter((c) => c.id !== category.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Order" hint="Lower numbers show first in your store.">
              {(p) => <Input {...p} name="sort" inputMode="numeric" defaultValue={category.sort} />}
            </Field>
          </div>
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
