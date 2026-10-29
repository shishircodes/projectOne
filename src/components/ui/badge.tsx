import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-accent-soft text-link",
  brand: "bg-brand-soft text-brand-text",
};

/** Status always carries text, never color alone; the dot is reinforcement. */
export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const ORDER_TONE: Record<string, Tone> = {
  pending: "warn",
  confirmed: "info",
  shipped: "info",
  delivered: "good",
  cancelled: "bad",
  returned: "bad",
};
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const OrderStatusBadge = ({ status }: { status: string }) => (
  <Badge tone={ORDER_TONE[status] ?? "neutral"} dot>
    {cap(status)}
  </Badge>
);

export const PaymentBadge = ({ status }: { status: string }) => (
  <Badge tone={status === "paid" ? "good" : status === "refunded" ? "neutral" : "neutral"}>{cap(status)}</Badge>
);

const CHANNEL: Record<string, { label: string; color: string }> = {
  website: { label: "Website", color: "var(--brand)" },
  whatsapp: { label: "WhatsApp", color: "#25d366" },
  messenger: { label: "Messenger", color: "#0866ff" },
  instagram: { label: "Instagram", color: "#e1306c" },
  tiktok: { label: "TikTok", color: "#25c4cc" },
  walkin: { label: "Walk-in", color: "var(--text-3)" },
  other: { label: "Other", color: "var(--text-3)" },
};
export const channelLabel = (c: string) => CHANNEL[c]?.label ?? c;

export function ChannelTag({ channel, className }: { channel: string; className?: string }) {
  const c = CHANNEL[channel] ?? { label: channel, color: "var(--text-3)" };
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-fg-2", className)}>
      <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
      {c.label}
    </span>
  );
}
