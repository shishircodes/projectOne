import type { CSSProperties } from "react";

/** Readable text on the store's brand color (WCAG relative luminance). */
function inkFor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}

export function brandVars(color: string): CSSProperties {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#c8102e";
  return {
    ["--brand" as string]: c,
    ["--brand-hover" as string]: `color-mix(in srgb, ${c} 88%, black)`,
    ["--brand-ink" as string]: inkFor(c),
    ["--brand-soft" as string]: `color-mix(in srgb, ${c} 10%, var(--surface))`,
  };
}
