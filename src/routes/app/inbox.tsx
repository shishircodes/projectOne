import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { FlaskConical, MessagesSquare } from "lucide-react";
import { requireFeature } from "~/lib/nav";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Field, Input, Select, Textarea } from "~/components/ui/field";
import { ChannelTag } from "~/components/ui/badge";
import { Modal } from "~/components/ui/overlay";
import { Avatar, EmptyState, PageHeader, Segmented, Skeleton } from "~/components/ui/misc";
import { initials, relative } from "~/lib/format";
import { cn } from "~/lib/cn";
import { CHANNELS } from "~/lib/types";
import { api, call, qs } from "~/lib/api";

const search = z.object({ channel: z.enum(CHANNELS).optional().catch(undefined) });

export const Route = createFileRoute("/app/inbox")({
  beforeLoad: ({ context }) => requireFeature(context.session, "inbox"),
  validateSearch: search,
  loaderDeps: ({ search }) => ({ channel: search.channel }),
  loader: ({ deps }) => call(api.conversations.$get({ query: qs({ channel: deps.channel }) })),
  head: () => ({ meta: [{ title: "Inbox · NepalShop" }] }),
  pendingComponent: () => (
    <>
      <PageHeader title="Inbox" />
      <Skeleton className="h-[60dvh] rounded-xl" />
    </>
  ),
  component: Inbox,
});

function Inbox() {
  const conversations = Route.useLoaderData();
  const { channel } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const matchRoute = useMatchRoute();
  const active = matchRoute({ to: "/app/inbox/$id" }) as { id: string } | false;
  const [testOpen, setTestOpen] = useState(false);

  return (
    <>
      <div className={cn(active && "hidden lg:block")}>
        <PageHeader
          title="Inbox"
          description="WhatsApp, Messenger, Instagram and TikTok in one place."
          actions={
            <Button onClick={() => setTestOpen(true)}>
              <FlaskConical /> Try a test message
            </Button>
          }
        />
      </div>

      <div className="grid overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:h-[calc(100dvh-11.5rem)] lg:grid-cols-[22rem_1fr]">
        <section aria-label="Conversations" className={cn("flex min-h-0 flex-col border-border lg:border-r", active && "hidden lg:flex")}>
          <div className="border-b border-border p-2">
            <Segmented
              size="sm"
              label="Channel"
              value={channel ?? "all"}
              onChange={(v) => navigate({ search: { channel: v === "all" ? undefined : (v as any) }, replace: true })}
              options={[
                { value: "all", label: "All" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "messenger", label: "Messenger" },
                { value: "instagram", label: "Instagram" },
                { value: "tiktok", label: "TikTok" },
              ]}
            />
          </div>
          {conversations.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare />}
              title="No conversations yet"
              description={
                <>
                  Connect your accounts under{" "}
                  <Link to="/app/channels" className="text-link hover:underline">
                    Channels
                  </Link>
                  , or send yourself a test message.
                </>
              }
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {conversations.map((c) => {
                const on = active && active.id === String(c.id);
                return (
                  <li key={c.id}>
                    <Link
                      to="/app/inbox/$id"
                      params={{ id: String(c.id) }}
                      search={{ channel }}
                      className={cn(
                        "flex gap-3 border-b border-border px-3 py-3 hover:bg-surface-2/70",
                        on && "bg-surface-2 shadow-[inset_2px_0_0_var(--brand)]",
                      )}
                    >
                      <Avatar name={initials(c.customer_name ?? c.external_user_id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.customer_name || c.external_user_id}</span>
                          <span className="shrink-0 text-xs text-fg-3">{relative(c.last_message_at)}</span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-sm", c.unread ? "text-fg" : "text-fg-2")}>{c.last_message}</span>
                          {c.unread > 0 && (
                            <span className="tabular min-w-5 shrink-0 rounded-full bg-brand px-1.5 text-center text-xs font-semibold leading-5 text-brand-ink">{c.unread}</span>
                          )}
                        </span>
                        <ChannelTag channel={c.channel} className="mt-1" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className={cn("min-h-0 min-w-0", !active && "hidden lg:block")}>
          <Outlet />
        </section>
      </div>

      <TestMessage open={testOpen} onClose={() => setTestOpen(false)} />
    </>
  );
}

function TestMessage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    try {
      const conv = await call(api.conversations.test.$post({ json: { channel: d.channel, from: d.from, name: d.name, text: d.text } }));
      onClose();
      await router.invalidate();
      if (conv) navigate({ to: "/app/inbox/$id", params: { id: String(conv.id) } });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Send a test message" description="Pretend to be a customer, to see how the inbox works before connecting real accounts.">
      <form method="post" onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channel">
            {(p) => (
              <Select {...p} name="channel" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="messenger">Messenger</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
              </Select>
            )}
          </Field>
          <Field label="Customer name">{(p) => <Input {...p} name="name" defaultValue="Sita Sharma" />}</Field>
        </div>
        <Field label="Phone or user id">{(p) => <Input {...p} name="from" defaultValue="9841000000" required />}</Field>
        <Field label="Message">
          {(p) => <Textarea {...p} name="text" rows={2} required defaultValue="Namaste! Is the pashmina shawl available in red? Can you deliver to Pokhara?" />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Send test message
          </Button>
        </div>
      </form>
    </Modal>
  );
}
