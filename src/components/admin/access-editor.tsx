import { Minus, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/misc";
import { ALL_FEATURES, FEATURES, REQUIRES, normalizeFeatures, type Feature } from "~/lib/features";
import { cn } from "~/lib/cn";

export type Access = { features: Feature[]; maxStores: number };

const PRESETS: { label: string; features: Feature[] }[] = [
  { label: "Everything", features: ALL_FEATURES },
  { label: "Catalogue & orders", features: ["analytics", "products", "orders"] },
  { label: "Online shop", features: ["analytics", "products", "orders", "storefront", "online_payments"] },
  { label: "None", features: [] },
];

/** Feature switches + store limit. Dependent features turn off with their prerequisite. */
export function AccessEditor({ value, onChange, owned }: { value: Access; onChange: (v: Access) => void; owned?: number }) {
  const has = (f: Feature) => value.features.includes(f);
  const toggle = (f: Feature, on: boolean) => onChange({ ...value, features: normalizeFeatures(on ? [...value.features, f] : value.features.filter((x) => x !== f)) });
  const same = (a: Feature[], b: Feature[]) => a.length === b.length && a.every((x) => b.includes(x));

  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Features</h3>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange({ ...value, features: p.features })}
                aria-pressed={same(value.features, p.features)}
                className={cn(
                  "pressable rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  same(value.features, p.features) ? "border-accent bg-accent-soft text-link" : "border-border text-fg-2 hover:border-border-strong",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {FEATURES.map((f) => {
            const needs = REQUIRES[f.key];
            const blocked = !!needs && !has(needs);
            return (
              <li key={f.key} className={cn("flex items-start gap-3 px-4 py-3", blocked && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-fg-3">{blocked ? `Turn on ${FEATURES.find((x) => x.key === needs)?.label} first.` : f.description}</p>
                </div>
                <Switch checked={has(f.key)} onCheckedChange={(on) => toggle(f.key, on)} disabled={blocked} label={f.label} />
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-fg-3">Store settings (name, address, contact, delivery fees) are always available.</p>
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Stores</h3>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">How many stores they can own</p>
            <p className="text-xs text-fg-3">
              {value.maxStores === 0 ? "They can't create a store." : value.maxStores === 1 ? "One store." : `Up to ${value.maxStores} stores, with a switcher in their dashboard.`}
              {owned !== undefined && ` They have ${owned} now.`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" aria-label="Fewer stores" onClick={() => onChange({ ...value, maxStores: Math.max(0, value.maxStores - 1) })} disabled={value.maxStores <= 0}>
              <Minus />
            </Button>
            <span className="tabular w-8 text-center font-semibold" aria-live="polite">
              {value.maxStores}
            </span>
            <Button size="icon-sm" aria-label="More stores" onClick={() => onChange({ ...value, maxStores: Math.min(100, value.maxStores + 1) })}>
              <Plus />
            </Button>
          </div>
        </div>
        {owned !== undefined && value.maxStores < owned && (
          <p className="text-xs text-warn">They already own {owned}. Existing stores stay; they just can't create more.</p>
        )}
      </section>
    </div>
  );
}
