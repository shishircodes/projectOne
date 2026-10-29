// Same conventions as the dashboard (src/lib/format.ts): rupees with lakh grouping, Nepal time.
// Written without Intl.PluralRules / Segmenter, which Hermes doesn't ship on every platform.
import type { Tone } from "./theme";

const TZ = "Asia/Kathmandu";

/** 1234567.5 -> "12,34,567.5" (Indian/Nepali grouping), without relying on Intl locale data. */
function group(n: number, decimals: number) {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  let [int, frac] = fixed.split(".");
  if (frac) frac = frac.replace(/0+$/, "");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return (neg ? "-" : "") + grouped + (frac ? "." + frac : "");
}

export const rs = (n: number | null | undefined) => "Rs. " + group(n ?? 0, 2);
export const num = (n: number | null | undefined) => group(n ?? 0, 0);

/** Compact rupees for tiles: Rs. 7.8 L, Rs. 1.2 Cr. */
export function rsShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e7) return `Rs. ${(n / 1e7).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (a >= 1e5) return `Rs. ${(n / 1e5).toFixed(1).replace(/\.0$/, "")} L`;
  if (a >= 1e3) return `Rs. ${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return "Rs. " + group(n, 0);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

export function dateTime(d: string) {
  try {
    return new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return new Date(d).toLocaleString();
  }
}

export function timeOnly(d: string) {
  try {
    return new Date(d).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch {
    return new Date(d).toLocaleTimeString();
  }
}

/** "now", "5m", "3h", "2d", then a date. */
export function relative(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  try {
    return new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
  } catch {
    return new Date(d).toDateString();
  }
}

export function initials(name: string | null | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = (w: string) => Array.from(w)[0] ?? "";
  return (first(words[0]) + (words.length > 1 ? first(words[words.length - 1]) : "")).toUpperCase();
}

export function percentChange(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const ORDER_TONE: Record<string, Tone> = {
  pending: "warn",
  confirmed: "info",
  shipped: "info",
  delivered: "good",
  cancelled: "bad",
  returned: "bad",
};

export const CHANNELS: Record<string, { label: string; color: string }> = {
  website: { label: "Website", color: "#5464f5" },
  whatsapp: { label: "WhatsApp", color: "#25d366" },
  messenger: { label: "Messenger", color: "#0866ff" },
  instagram: { label: "Instagram", color: "#e1306c" },
  tiktok: { label: "TikTok", color: "#25c4cc" },
  walkin: { label: "Walk-in", color: "#858c9b" },
  other: { label: "Other", color: "#858c9b" },
};
export const channelLabel = (c: string) => CHANNELS[c]?.label ?? cap(c);
