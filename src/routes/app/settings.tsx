import { createFileRoute, getRouteApi, useBlocker, useRouter } from "@tanstack/react-router";
import { ImagePlus, X } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "~/components/ui/field";
import { Badge } from "~/components/ui/badge";
import { Card, PageHeader } from "~/components/ui/misc";
import { storeUrl } from "~/components/app/shell";
import { uploadImage } from "~/lib/upload";
import { FONT_STYLES, type FontStyle, type Store } from "~/lib/types";
import { cn } from "~/lib/cn";
import { api, call } from "~/lib/api";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Settings · NepalShop" }] }),
  component: Settings,
});

const app = getRouteApi("/app");

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 md:grid-cols-[14rem_1fr] md:gap-8">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
      </div>
      <div className="grid min-w-0 gap-4">{children}</div>
    </Card>
  );
}

function Settings() {
  const { session } = app.useRouteContext();
  const s = session.store;
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(s.logo_url);
  const [color, setColor] = useState(s.theme_color);
  const [banner, setBanner] = useState<string | null>(s.banner_url);
  const [font, setFont] = useState<FontStyle>(s.font_style);
  const [mode, setMode] = useState(s.payment_mode);
  const [formKey, setFormKey] = useState(0);

  // Don't lose edits on navigation.
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("You have unsaved changes. Leave without saving?"), enableBeforeUnload: () => dirty });

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!form.current?.reportValidity()) return;
    const fd = new FormData(form.current);
    const d: Record<string, unknown> = Object.fromEntries(fd);
    for (const k of ["published", "cod_enabled", "clear_esewa", "clear_khalti"]) d[k] = fd.get(k) === "on";
    setSaving(true);
    setError(null);
    try {
      await call(api.store.$put({ json: { ...(d as Partial<Store>), logo_url: logo, theme_color: color, banner_url: banner, font_style: font } }));
      setDirty(false);
      toast.success("Settings saved");
      await router.invalidate();
      setFormKey((k) => k + 1); // reset uncontrolled fields (e.g. cleared secret inputs)
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setLogo(s.logo_url);
    setColor(s.theme_color);
    setBanner(s.banner_url);
    setFont(s.font_style);
    setMode(s.payment_mode);
    setDirty(false);
    setFormKey((k) => k + 1);
  }

  const site = storeUrl(session);
  // Sections tied to features the admin may not have turned on for this account.
  const canStore = session.user.features.includes("storefront");
  const canPay = session.user.features.includes("online_payments");

  return (
    <>
      <PageHeader title="Store settings" description="How your store looks, where it lives, and how customers pay." />
      <form method="post" ref={form} key={formKey} onSubmit={submit} onChange={() => setDirty(true)} className="grid gap-4 pb-20">
        <Section title="Store" description="Your store's name and web address.">
          <Field label="Store name">{(p) => <Input {...p} name="name" required maxLength={100} defaultValue={s.name} />}</Field>
          <Field
            label="Store address"
            hint={canStore ? <>Your site: <a href={site} target="_blank" rel="noopener" className="text-link hover:underline">{site.replace(/^https?:\/\//, "")}</a></> : "Used in your store's links."}
          >
            {(p) => (
              <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface shadow-sm focus-within:border-accent focus-within:ring-3 focus-within:ring-[var(--ring)]">
                <span className="shrink-0 border-r border-border bg-surface-2 px-3 py-2 text-sm text-fg-3">{session.baseDomain ? "https://" : "/s/"}</span>
                <input {...p} name="slug" required maxLength={60} defaultValue={s.slug} className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" spellCheck={false} autoCapitalize="none" />
                {session.baseDomain && <span className="shrink-0 px-3 text-sm text-fg-3">.{session.baseDomain}</span>}
              </div>
            )}
          </Field>
          {canStore ? (
            <>
              <Field label="Custom domain" optional hint="Point a CNAME record for this domain at this server, then save.">
                {(p) => <Input {...p} name="custom_domain" defaultValue={s.custom_domain ?? ""} placeholder="shop.yourbrand.com.np" spellCheck={false} autoCapitalize="none" />}
              </Field>
              <Checkbox name="published" defaultChecked={s.published} label="Store is published" hint="When off, only you can preview it." />
            </>
          ) : (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2">Publishing an online store isn't turned on for your account. Ask the NepalShop team if you need it.</p>
          )}
        </Section>

        <Section title="Brand" description="Shown at the top of your store and in shared links.">
          <div className="flex items-center gap-4">
            <ImageField value={logo} onChange={(v) => (setLogo(v), setDirty(true))} label="logo" className="size-16" />
            <Field label="Theme color" className="flex-1">
              {(p) => (
                <div className="flex items-center gap-2">
                  <input {...p} type="color" value={color} onChange={(e) => (setColor(e.target.value), setDirty(true))} className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1" />
                  <code className="font-mono text-sm text-fg-2">{color}</code>
                </div>
              )}
            </Field>
          </div>
          <Field label="Tagline" optional>
            {(p) => <Input {...p} name="tagline" maxLength={160} defaultValue={s.tagline} placeholder="Handmade in Nepal, delivered to your door" />}
          </Field>
          <Field label="About your store" optional>
            {(p) => <Textarea {...p} name="description" rows={3} maxLength={2000} defaultValue={s.description} />}
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Cover image <span className="font-normal text-fg-3">(optional)</span></span>
            <ImageField value={banner} onChange={(v) => (setBanner(v), setDirty(true))} label="cover image" className="aspect-[3/1] w-full" />
            <span className="text-xs text-fg-3">The big photo at the top of your store. A wide photo works best, at least 1600 px across.</span>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Heading style</span>
            <div role="radiogroup" aria-label="Heading style" className="grid grid-cols-3 gap-2">
              {FONT_STYLES.map((o) => {
                const on = font === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => (setFont(o.value), setDirty(true))}
                    className={cn("pressable rounded-xl border p-3 text-left", on ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}
                  >
                    <span data-font={o.value} className="font-display block text-2xl leading-none">Aa</span>
                    <span className="mt-2 block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-fg-3">{o.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Announcement" optional hint="One short line shown above your store, like a sale or delivery news.">
            {(p) => <Input {...p} name="announcement" maxLength={120} defaultValue={s.announcement} placeholder="Dashain sale: 15% off all shawls" />}
          </Field>
        </Section>

        <Section title="Contact & social" description="Shown as “Chat with us” buttons in your store. To get these messages in your inbox, connect them under Channels.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" optional>{(p) => <Input {...p} name="phone" type="tel" maxLength={30} defaultValue={s.phone ?? ""} />}</Field>
            <Field label="Email" optional>{(p) => <Input {...p} name="email" type="email" maxLength={200} defaultValue={s.email ?? ""} />}</Field>
          </div>
          <Field label="Address" optional>{(p) => <Input {...p} name="address" maxLength={300} defaultValue={s.address ?? ""} placeholder="New Road, Kathmandu" />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp number" optional>{(p) => <Input {...p} name="whatsapp_number" inputMode="tel" maxLength={20} defaultValue={s.whatsapp_number ?? ""} placeholder="98XXXXXXXX" />}</Field>
            <Field label="Facebook page username" optional>{(p) => <Input {...p} name="facebook_page" maxLength={100} defaultValue={s.facebook_page ?? ""} />}</Field>
            <Field label="Instagram" optional>{(p) => <Input {...p} name="instagram_handle" maxLength={60} defaultValue={s.instagram_handle ?? ""} placeholder="@yourstore" />}</Field>
            <Field label="TikTok" optional>{(p) => <Input {...p} name="tiktok_handle" maxLength={60} defaultValue={s.tiktok_handle ?? ""} placeholder="@yourstore" />}</Field>
          </div>
        </Section>

        <Section title="Delivery" description="Charged at checkout based on where the customer is.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Inside Kathmandu Valley">{(p) => <Input {...p} name="delivery_fee_inside" inputMode="decimal" defaultValue={s.delivery_fee_inside} />}</Field>
            <Field label="Outside the valley">{(p) => <Input {...p} name="delivery_fee_outside" inputMode="decimal" defaultValue={s.delivery_fee_outside} />}</Field>
            <Field label="Free delivery over" optional>{(p) => <Input {...p} name="free_delivery_over" inputMode="decimal" defaultValue={s.free_delivery_over ?? ""} placeholder="e.g. 5000" />}</Field>
          </div>
        </Section>

        {canStore && (
        <Section
          title="Payments"
          description="Cash on delivery and manual wallet transfers work right away. Online eSewa/Khalti mark orders paid automatically once the gateway confirms."
        >
          <Checkbox name="cod_enabled" defaultChecked={s.cod_enabled} label="Cash on delivery" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="eSewa ID (manual)" optional hint="Customers send money to this ID.">{(p) => <Input {...p} name="esewa_id" maxLength={60} defaultValue={s.esewa_id ?? ""} />}</Field>
            <Field label="Khalti ID (manual)" optional>{(p) => <Input {...p} name="khalti_id" maxLength={60} defaultValue={s.khalti_id ?? ""} />}</Field>
          </div>
          {canPay && (
          <div className="grid gap-4 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Online payments</p>
              <Field label={<span className="sr-only">Mode</span>}>
                {(p) => (
                  <Select {...p} name="payment_mode" value={mode} onChange={(e) => setMode(e.target.value as "test" | "live")} className="w-52">
                    <option value="test">Test mode (no real money)</option>
                    <option value="live">Live</option>
                  </Select>
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  eSewa {s.esewa_online ? <Badge tone="good" dot>On</Badge> : <Badge>Off</Badge>}
                </p>
                <Field label="Merchant code" optional hint={mode === "test" ? "Use EPAYTEST to try the sandbox." : undefined}>
                  {(p) => <Input {...p} name="esewa_merchant_code" maxLength={60} defaultValue={s.esewa_merchant_code ?? ""} spellCheck={false} />}
                </Field>
                <Field label="Secret key" optional hint={s.esewa_secret_set ? "Saved. Leave blank to keep it." : undefined}>
                  {(p) => <Input {...p} name="esewa_secret_key" type="password" autoComplete="off" placeholder={s.esewa_secret_set ? "••••••••" : ""} />}
                </Field>
                {s.esewa_secret_set && <Checkbox name="clear_esewa" label="Remove saved key" />}
              </div>
              <div className="grid content-start gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  Khalti {s.khalti_online ? <Badge tone="good" dot>On</Badge> : <Badge>Off</Badge>}
                </p>
                <Field label="Secret key" optional hint={s.khalti_secret_set ? "Saved. Leave blank to keep it." : `From ${mode === "test" ? "test-admin.khalti.com" : "admin.khalti.com"}.`}>
                  {(p) => <Input {...p} name="khalti_secret_key" type="password" autoComplete="off" placeholder={s.khalti_secret_set ? "••••••••" : ""} />}
                </Field>
                {s.khalti_secret_set && <Checkbox name="clear_khalti" label="Remove saved key" />}
              </div>
            </div>
          </div>
          )}
        </Section>
        )}
        <FormError message={error} />
      </form>

      {/* Save bar appears only when there's something to save. */}
      <div
        aria-hidden={!dirty}
        className={`glass fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/90 backdrop-blur-xl transition-[transform,opacity] duration-200 ease-[var(--ease-out)] lg:bottom-0 lg:left-60 ${dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
      >
        <div className="mx-auto flex max-w-[84rem] items-center justify-end gap-2 px-4 py-3 sm:px-6">
          <p className="mr-auto text-sm text-fg-2">You have unsaved changes</p>
          <Button onClick={discard} tabIndex={dirty ? 0 : -1}>
            Discard
          </Button>
          <Button variant="primary" loading={saving} onClick={() => submit()} tabIndex={dirty ? 0 : -1}>
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
}

function ImageField({ value, onChange, label, className }: { value: string | null; onChange: (v: string | null) => void; label: string; className: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn("pressable grid place-items-center overflow-hidden rounded-xl border border-dashed border-border-strong text-fg-3 hover:border-accent hover:text-link", className)}
        aria-label={value ? `Change ${label}` : `Upload ${label}`}
      >
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className={busy ? "animate-pulse" : ""} />}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-border bg-surface shadow-sm" aria-label={`Remove ${label}`}>
          <X className="size-3.5" />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await uploadImage(f));
          } catch (err: any) {
            toast.error(err.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
