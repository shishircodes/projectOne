// Formatting shared by dashboard and storefront. Nepal uses lakh/crore grouping (en-IN) and Asia/Kathmandu time.

export const TZ = "Asia/Kathmandu";
const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const rs = (n: number | null | undefined) => "Rs. " + nf.format(n ?? 0);
export const num = (n: number | null | undefined) => nf0.format(n ?? 0);

/** Compact rupees for tiles and chart axes: Rs. 7.8 L, Rs. 1.2 Cr. */
export function rsShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e7) return `Rs. ${(n / 1e7).toFixed(1).replace(/\.0$/, "")} Cr`;
  if (a >= 1e5) return `Rs. ${(n / 1e5).toFixed(1).replace(/\.0$/, "")} L`;
  if (a >= 1e3) return `Rs. ${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return "Rs. " + nf0.format(n);
}

export const dateTime = (d: string | Date) =>
  new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const dateOnly = (d: string | Date) => new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
export const dayLabel = (isoDay: string) => new Date(isoDay + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const timeOnly = (d: string | Date) => new Date(d).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export function relative(d: string | Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
}

const pr = new Intl.PluralRules("en");
/** plural(1, "order") -> "1 order"; plural(3, "order") -> "3 orders" */
export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${pr.select(n) === "one" ? one : many}`;

/** Initials from grapheme clusters (works for emoji and Devanagari), first + last word. */
export function initials(name: string | null | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const seg = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
  const first = (w: string) => (seg ? [...seg.segment(w)][0]?.segment : w[0]) ?? "";
  return (first(words[0]) + (words.length > 1 ? first(words[words.length - 1]) : "")).toUpperCase();
}

export function percentChange(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}
