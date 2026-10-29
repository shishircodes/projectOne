import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check, ChevronDown, Copy } from "lucide-react";
import { requireFeature } from "~/lib/nav";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox, Field, FormError, Input } from "~/components/ui/field";
import { Badge, ChannelTag } from "~/components/ui/badge";
import { Card, PageHeader } from "~/components/ui/misc";
import { confirmAction } from "~/components/ui/confirm";
import { ListSkeleton } from "~/components/app/list-skeleton";
import type { Channel } from "~/lib/types";
import type { InferResponseType } from "hono/client";
import { api, call } from "~/lib/api";

export const Route = createFileRoute("/app/channels")({
  beforeLoad: ({ context }) => requireFeature(context.session, "channels"),
  loader: () => call(api.channels.$get()),
  head: () => ({ meta: [{ title: "Channels · NepalShop" }] }),
  pendingComponent: () => <ListSkeleton title="Channels" />,
  component: Channels,
});

const SETUP: Record<Channel, { idLabel: string; idHint: string; tokenLabel: string; steps: string[] }> = {
  whatsapp: {
    idLabel: "Phone number ID",
    idHint: "From WhatsApp → API Setup in the Meta app. It's not the phone number itself.",
    tokenLabel: "Permanent access token",
    steps: [
      "Add your business number to WhatsApp in Meta Business Suite.",
      "Copy its Phone number ID from WhatsApp → API Setup.",
      "Create a System User token with the whatsapp_business_messaging permission.",
    ],
  },
  messenger: {
    idLabel: "Facebook Page ID",
    idHint: "Page → About → Page transparency.",
    tokenLabel: "Page access token",
    steps: ["Connect your Facebook Page to the Meta app.", "Generate a Page access token with pages_messaging.", "Subscribe the Page to the messages webhook."],
  },
  instagram: {
    idLabel: "Instagram account ID",
    idHint: "The professional account linked to your Facebook Page.",
    tokenLabel: "Page access token",
    steps: [
      "Switch Instagram to a Professional account and link it to your Page.",
      "Turn on Settings → Messages → Allow access to messages.",
      "Use the linked Page's token with instagram_manage_messages.",
    ],
  },
  tiktok: {
    idLabel: "TikTok Business ID",
    idHint: "Requires approved TikTok Business Messaging access.",
    tokenLabel: "Business access token",
    steps: ["TikTok must approve Business Messaging for your app and region.", "Authorise your TikTok Business account.", "Set the webhook URL below in your TikTok developer app."],
  },
};

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-fg-3">{label}</span>
      <div className="flex items-center gap-1 rounded-lg bg-surface-2 py-1 pl-3 pr-1">
        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={value}>
          {value}
        </code>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Copy ${label}`}
          onClick={() =>
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="text-good" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

function Channels() {
  const data = Route.useLoaderData();
  const byType = Object.fromEntries(data.channels.map((c) => [c.type, c]));
  return (
    <>
      <PageHeader title="Channels" description="Connect your accounts so customer messages arrive in your Inbox, and replies go back the same way." />
      <div className="grid gap-4 xl:grid-cols-2">
        {(["whatsapp", "messenger", "instagram", "tiktok"] as const).map((t) => (
          <ChannelCard key={t} type={t} existing={byType[t]} webhooks={data.webhooks} />
        ))}
      </div>
    </>
  );
}

function ChannelCard({ type, existing, webhooks }: { type: Channel; existing?: { external_id: string; display_name: string | null; enabled: boolean }; webhooks: InferResponseType<typeof api.channels.$get>["webhooks"] }) {
  const router = useRouter();
  const s = SETUP[type];
  const [open, setOpen] = useState(!existing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hook = type === "tiktok" ? webhooks.tiktok : webhooks.meta;
  const verifyToken = type === "tiktok" ? null : webhooks.meta.verifyToken;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError(null);
    try {
      await call(api.channels[":type"].$put({ param: { type }, json: { external_id: d.external_id, access_token: d.access_token, display_name: d.display_name, enabled: d.enabled === "on" } }));
      toast.success(existing ? "Saved" : "Connected");
      router.invalidate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    const ok = await confirmAction({ title: "Disconnect this account?", description: "Existing conversations stay in your inbox. New messages won't arrive until you reconnect.", confirmLabel: "Disconnect", danger: true });
    if (!ok) return;
    await call(api.channels[":type"].$delete({ param: { type } }));
    toast.success("Disconnected");
    router.invalidate();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <ChannelTag channel={type} className="text-base font-semibold text-fg [&>span:first-child]:size-2.5" />
        {existing ? (
          existing.enabled ? (
            <Badge tone="good" dot>
              Connected
            </Badge>
          ) : (
            <Badge>Paused</Badge>
          )
        ) : (
          <Badge>Not connected</Badge>
        )}
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 flex items-center gap-1 text-sm text-fg-2 hover:text-fg" aria-expanded={open}>
        How to connect <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm text-fg-2">
          {s.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      )}

      <form method="post" onSubmit={submit} className="mt-4 grid gap-4">
        <Field label={s.idLabel} hint={s.idHint}>
          {(p) => <Input {...p} name="external_id" required defaultValue={existing?.external_id} spellCheck={false} />}
        </Field>
        <Field label={s.tokenLabel} hint={existing ? "Saved securely. Leave blank to keep it." : "Stored encrypted."}>
          {(p) => <Input {...p} name="access_token" type="password" autoComplete="off" required={!existing} placeholder={existing ? "••••••••" : ""} />}
        </Field>
        <Field label="Display name" optional>
          {(p) => <Input {...p} name="display_name" defaultValue={existing?.display_name ?? ""} />}
        </Field>
        <Checkbox name="enabled" label="Receive messages" defaultChecked={existing ? existing.enabled : true} />
        <div className="grid gap-2 rounded-xl border border-border p-3">
          <CopyValue label={type === "tiktok" ? "Webhook URL (TikTok app)" : "Webhook URL (Meta app)"} value={hook.url} />
          {verifyToken && <CopyValue label="Verify token" value={verifyToken} />}
          {!hook.configured && <p className="text-xs text-warn">{type === "tiktok" ? "TIKTOK_CLIENT_SECRET" : "META_APP_SECRET"} isn't set on the server yet, so incoming messages will be rejected.</p>}
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          {existing && (
            <Button variant="ghost" className="mr-auto text-bad" onClick={disconnect}>
              Disconnect
            </Button>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            {existing ? "Save" : "Connect"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
