import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, Copy, KeyRound, MoreHorizontal, Search, ShieldCheck, ShieldOff, SlidersHorizontal, Store, UserPlus, UserRoundCheck, UserRoundX, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AccessEditor, type Access } from "~/components/admin/access-editor";
import { ALL_FEATURES, FEATURES } from "~/lib/features";
import { Button } from "~/components/ui/button";
import { Checkbox, Field, FormError, Input } from "~/components/ui/field";
import { Badge } from "~/components/ui/badge";
import { DropdownMenu, MenuItem, MenuSeparator, Modal, Sheet } from "~/components/ui/overlay";
import { Avatar, Card, EmptyState, PageHeader } from "~/components/ui/misc";
import { confirmAction } from "~/components/ui/confirm";
import { ListSkeleton } from "~/components/app/list-skeleton";
import { textParam } from "~/lib/search";
import { initials, num, plural, relative } from "~/lib/format";
import type { Account } from "~/server/services/admin";
import { api, call, qs } from "~/lib/api";

export const Route = createFileRoute("/admin/")({
  validateSearch: z.object({ q: textParam }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => call(api.admin.accounts.$get({ query: qs({ q: deps.q }) })),
  pendingComponent: () => <ListSkeleton title="Accounts" />,
  component: Accounts,
});

type Credentials = { email: string; password: string; title: string };

function Accounts() {
  const { accounts, totals } = Route.useLoaderData();
  const { q: initialQ } = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const [q, setQ] = useState(initialQ ?? "");
  const [inviting, setInviting] = useState(false);
  const [storeFor, setStoreFor] = useState<Account | null>(null);
  const [accessFor, setAccessFor] = useState<Account | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  useEffect(() => {
    if ((initialQ ?? "") === q) return;
    const t = setTimeout(() => navigate({ search: { q: q || undefined }, replace: true }), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      toast.success(done);
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function reset(a: Account) {
    const ok = await confirmAction({
      title: `Reset ${a.name}'s password?`,
      description: "They'll be signed out everywhere and must choose a new password with the one-time password you give them.",
      confirmLabel: "Reset password",
    });
    if (!ok) return;
    try {
      const r = await call(api.admin.accounts[":id"]["reset-password"].$post({ param: { id: a.id } }));
      setCreds({ ...r, title: "New one-time password" });
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function toggleDisabled(a: Account) {
    if (!a.disabled) {
      const ok = await confirmAction({
        title: `Disable ${a.name}?`,
        description: a.stores.length
          ? `They're signed out immediately and can't log in. ${a.stores.length === 1 ? `"${a.stores[0].name}" closes` : `Their ${a.stores.length} stores close`} to customers until you enable the account again.`
          : "They're signed out immediately and can't log in.",
        confirmLabel: "Disable account",
        danger: true,
      });
      if (!ok) return;
    }
    run(() => call(api.admin.accounts[":id"].disabled.$put({ param: { id: a.id }, json: { disabled: !a.disabled } })), a.disabled ? "Account enabled" : "Account disabled");
  }

  const me = session.user.id;

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Private trial: every account is created here. People sign in with a one-time password and choose their own."
        actions={
          <Button variant="primary" onClick={() => setInviting(true)}>
            <UserPlus /> Add account
          </Button>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
        {[
          { label: "Accounts", value: totals.users },
          { label: "Stores", value: totals.stores },
          { label: "Live stores", value: totals.published },
          { label: "Waiting for first login", value: totals.pending },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-sm text-fg-2">{t.label}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-[-0.02em]">{num(t.value)}</p>
          </Card>
        ))}
      </section>

      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or store" className="pl-9" aria-label="Search accounts" />
      </div>

      <Card className="overflow-hidden">
        {accounts.length === 0 ? (
          <EmptyState icon={<Users />} title={q ? "No accounts match" : "No accounts yet"} />
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                  <Avatar name={initials(a.name)} className={a.disabled ? "opacity-50" : ""} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{a.name}</span>
                      {a.is_admin && <Badge tone="brand">Admin</Badge>}
                      {a.disabled && <Badge tone="bad">Disabled</Badge>}
                      {!a.disabled && a.must_change_password && <Badge tone="warn">Hasn't signed in</Badge>}
                      {a.id === me && <span className="text-xs text-fg-3">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-fg-3">{a.email}</p>
                  </div>
                </div>

                <div className="grid min-w-0 basis-60 gap-1.5">
                  {a.stores.map((st) => (
                    <div key={st.id} className="min-w-0">
                      <p className="flex items-center gap-1.5">
                        <a href={`/s/${st.slug}`} target="_blank" rel="noopener" className="truncate font-medium hover:underline">
                          {st.name}
                        </a>
                        {st.published ? (
                          <Badge tone="good" dot>
                            Live
                          </Badge>
                        ) : (
                          <Badge>Not published</Badge>
                        )}
                      </p>
                      <p className="text-xs text-fg-3">
                        {plural(st.products, "product")} · {plural(st.orders, "order")}
                        {st.last_order_at && ` · last ${relative(st.last_order_at)}`}
                      </p>
                    </div>
                  ))}
                  <p className="flex items-center gap-2 text-xs text-fg-3">
                    {a.max_stores === 0 ? "Can't create stores" : `${a.stores.length} of ${a.max_stores} ${a.max_stores === 1 ? "store" : "stores"}`}
                    {a.stores.length < a.max_stores && (
                      <button type="button" onClick={() => setStoreFor(a)} className="font-medium text-link hover:underline">
                        Create store
                      </button>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAccessFor(a)}
                  className="pressable basis-44 rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-2"
                  title={a.features.map((f) => FEATURES.find((x) => x.key === f)?.label).join(", ") || "No features"}
                >
                  <span className="block font-medium">
                    {a.features.length === ALL_FEATURES.length ? "All features" : a.features.length === 0 ? "No features" : `${a.features.length} of ${ALL_FEATURES.length} features`}
                  </span>
                  <span className="block truncate text-xs text-fg-3">
                    {a.features.length === ALL_FEATURES.length
                      ? "Full access"
                      : FEATURES.filter((x) => a.features.includes(x.key))
                          .map((x) => x.label)
                          .join(", ") || "Store settings only"}
                  </span>
                </button>

                <p className="w-28 text-sm text-fg-3" title={a.last_login_at ? new Date(a.last_login_at).toLocaleString() : undefined}>
                  {a.last_login_at ? `Seen ${relative(a.last_login_at)}` : "Never signed in"}
                </p>

                <DropdownMenu
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
                      <MoreHorizontal />
                    </Button>
                  }
                >
                  <MenuItem onClick={() => setAccessFor(a)}>
                    <SlidersHorizontal /> Features and store limit
                  </MenuItem>
                  {a.stores.length < a.max_stores && (
                    <MenuItem onClick={() => setStoreFor(a)}>
                      <Store /> Create store
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => reset(a)}>
                    <KeyRound /> Reset password
                  </MenuItem>
                  {a.id !== me && (
                    <>
                      <MenuItem onClick={() => run(() => call(api.admin.accounts[":id"].admin.$put({ param: { id: a.id }, json: { isAdmin: !a.is_admin } })), a.is_admin ? "Admin access removed" : "Admin access granted")}>
                        {a.is_admin ? <ShieldOff /> : <ShieldCheck />} {a.is_admin ? "Remove admin access" : "Make admin"}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger={!a.disabled} onClick={() => toggleDisabled(a)}>
                        {a.disabled ? <UserRoundCheck /> : <UserRoundX />} {a.disabled ? "Enable account" : "Disable account"}
                      </MenuItem>
                    </>
                  )}
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <InviteSheet open={inviting} onClose={() => setInviting(false)} onCreated={(c) => (setInviting(false), setCreds(c), router.invalidate())} />
      <CreateStore account={storeFor} onClose={() => setStoreFor(null)} />
      <AccessSheet account={accessFor} isSelf={accessFor?.id === me} onClose={() => setAccessFor(null)} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}

function InviteSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Credentials) => void }) {
  const [withStore, setWithStore] = useState(true);
  const [access, setAccess] = useState<Access>({ features: ALL_FEATURES, maxStores: 1 });
  useEffect(() => {
    if (open) setAccess({ features: ALL_FEATURES, maxStores: 1 });
  }, [open]);
  const storeNow = withStore && access.maxStores > 0;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      const r = await call(
        api.admin.accounts.$post({
          json: { name: d.name, email: d.email, storeName: storeNow ? d.storeName : undefined, makeAdmin: d.makeAdmin === "on", features: access.features, maxStores: access.maxStores },
        }),
      );
      onCreated({ email: r.email, password: r.password, title: r.store ? "Account and store created" : "Account created" });
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
      title="Add account"
      width="36rem"
      description="They'll get a one-time password and choose their own when they first sign in."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="invite-form" variant="primary" loading={busy}>
            Create account
          </Button>
        </>
      }
    >
      <form method="post" id="invite-form" onSubmit={submit} className="grid gap-4" key={String(open)}>
        <Field label="Full name">{(p) => <Input {...p} name="name" required maxLength={100} autoComplete="off" autoFocus />}</Field>
        <Field label="Email" hint="They'll use this to log in.">
          {(p) => <Input {...p} name="email" type="email" required autoComplete="off" autoCapitalize="none" spellCheck={false} />}
        </Field>
        <AccessEditor value={access} onChange={setAccess} />
        {access.maxStores > 0 && (
          <div className="grid gap-3 rounded-xl border border-border p-4">
            <Checkbox label="Create their first store now" hint="Otherwise they name it themselves after signing in." checked={withStore} onChange={(e) => setWithStore(e.target.checked)} />
            {withStore && <Field label="Store name">{(p) => <Input {...p} name="storeName" required maxLength={100} placeholder="e.g. Himalayan Threads" />}</Field>}
          </div>
        )}
        <Checkbox name="makeAdmin" label="Admin access" hint="Can add and manage accounts. Give this only to the NepalShop team." />
        <FormError message={error} />
      </form>
    </Sheet>
  );
}

function AccessSheet({ account, isSelf, onClose }: { account: Account | null; isSelf: boolean; onClose: () => void }) {
  const router = useRouter();
  const [access, setAccess] = useState<Access>({ features: [], maxStores: 1 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (account) setAccess({ features: account.features, maxStores: account.max_stores });
  }, [account?.id]);

  async function save() {
    if (!account) return;
    setBusy(true);
    try {
      await call(api.admin.accounts[":id"].access.$put({ param: { id: account.id }, json: { features: access.features, maxStores: access.maxStores } }));
      toast.success(`Access updated for ${account.name}`, { description: "It applies the next time they open a page." });
      onClose();
      router.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!account}
      onOpenChange={(o) => !o && onClose()}
      title="Features and store limit"
      description={account ? `${account.name}${isSelf ? " (you)" : ""} · ${account.email}` : undefined}
      width="36rem"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save access
          </Button>
        </>
      }
    >
      {account && <AccessEditor value={access} onChange={setAccess} owned={account.stores.length} />}
    </Sheet>
  );
}

function CreateStore({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const name = String(new FormData(e.currentTarget).get("storeName"));
      await call(api.admin.accounts[":id"].stores.$post({ param: { id: account.id }, json: { storeName: name } }));
      toast.success(`Store created for ${account.name}`);
      onClose();
      router.invalidate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!account} onOpenChange={(o) => !o && onClose()} title="Create store" description={account ? `For ${account.name} (${account.email})` : undefined}>
      <form method="post" onSubmit={submit} className="grid gap-4" key={account?.id}>
        <Field label="Store name">{(p) => <Input {...p} name="storeName" required maxLength={100} autoFocus />}</Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Create store
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Shown once: the admin hands these to the person. Never stored in plain text. */
function CredentialsModal({ creds, onClose }: { creds: Credentials | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = typeof location !== "undefined" ? `${location.origin}/login` : "/login";
  const text = creds ? `NepalShop sign-in\n${loginUrl}\nEmail: ${creds.email}\nOne-time password: ${creds.password}\nYou'll choose your own password after signing in.` : "";
  return (
    <Modal open={!!creds} onOpenChange={(o) => !o && onClose()} title={creds?.title ?? ""} description="Share these sign-in details privately. The password is shown only once.">
      {creds && (
        <>
          <dl className="grid gap-2 rounded-xl bg-surface-2 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-2">Sign in at</dt>
              <dd className="truncate font-mono">{loginUrl}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-2">Email</dt>
              <dd className="truncate font-mono">{creds.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-2">One-time password</dt>
              <dd className="select-all font-mono text-base font-semibold tracking-wide">{creds.password}</dd>
            </div>
          </dl>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() =>
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
              }
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy sign-in details"}
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
