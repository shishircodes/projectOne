// NepalShop color system generator.
//   bun scripts/palette.ts                 -> contrast report for every direction
//   bun scripts/palette.ts --json          -> swatches for previews
//   bun scripts/palette.ts --write <name>  -> writes src/palette.css for the chosen direction
//
// Method (color-expert skill): 12-step role-based ramps built in OKLCH. Chroma is a *fraction of the sRGB gamut*
// available at each (L, h); warm hues rotate toward yellow as they lighten and toward red as they darken
// (Bezold–Brücke / Abney); neutrals are tinted toward a named hue. Semantic tokens are *derived* from the ramps
// (ink by measured contrast, muted text = lightest neutral that still passes), then every pair is checked with
// WCAG 2 and APCA in both themes.
import { clampChroma, converter, differenceEuclidean, formatHex, inGamut, wcagContrast, type Oklch } from "culori";
import { APCAcontrast, sRGBtoY } from "apca-w3";

type Mode = "light" | "dark";
const toRgb = converter("rgb");
const toOklab = converter("oklab");
const inSrgb = inGamut("rgb");

// Step roles (Radix-style): 1 app bg · 2 subtle bg · 3 element · 4 hover · 5 active · 6 subtle border · 7 border
// 8 strong border · 9 solid · 10 solid hover · 11 low-contrast text · 12 high-contrast text
const L_LIGHT = [0.993, 0.981, 0.958, 0.936, 0.912, 0.882, 0.835, 0.76, NaN, NaN, 0.5, 0.255];
const L_DARK = [0.165, 0.195, 0.232, 0.262, 0.292, 0.328, 0.385, 0.47, NaN, NaN, 0.8, 0.952];
// Share of available chroma per step (chromatic ramps); backgrounds stay quiet, solids sit near the gamut edge.
const REL_C = [0.07, 0.13, 0.22, 0.3, 0.38, 0.46, 0.55, 0.66, 0.92, 0.9, 0.82, 0.55];
const REL_C_DARK = [0.12, 0.18, 0.26, 0.32, 0.38, 0.44, 0.52, 0.62, 0.9, 0.88, 0.62, 0.3];

function maxChroma(l: number, h: number) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgb({ mode: "oklch", l, c: mid, h })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Warm-arc hue rotation with lightness, relative to the solid step (0 outside ~10°–115°). */
function warmShift(h: number, l: number, lSolid: number) {
  const w = h >= 10 && h <= 115 ? Math.min(1, (h - 10) / 15, (115 - h) / 20) : 0;
  const d = (l - lSolid) * 30; // ° per unit lightness
  return w * Math.max(-14, Math.min(8, d));
}

const hex = (c: Oklch) => formatHex(clampChroma(c, "oklch"))!;
const contrast = (a: string, b: string) => wcagContrast(a, b);
const apca = (text: string, bg: string) => {
  const t = toRgb(text)!, b = toRgb(bg)!;
  const y = (c: typeof t) => sRGBtoY([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]);
  return Math.round(Math.abs(APCAcontrast(y(t), y(b))));
};

type RampSpec = { hue: number; vibrancy?: number; solidL?: number };

/** Solid step: darkest-acceptable for light mode so white text passes 4.5:1, else keep near cusp with dark ink. */
function solidLightness(h: number, mode: Mode, vibrancy: number, override?: number) {
  if (override) return override;
  // Search from light to dark for the first L where white text reaches 4.6:1 at this hue's chroma.
  for (let l = 0.7; l >= 0.4; l -= 0.005) {
    const c = maxChroma(l, h) * 0.92 * vibrancy;
    if (contrast("#ffffff", hex({ mode: "oklch", l, c, h })) >= 4.6) return l;
  }
  return 0.55;
}

export function chromaticRamp(spec: RampSpec, mode: Mode): string[] {
  const vib = spec.vibrancy ?? 1;
  const Ls = solidLightness(spec.hue, mode, vib, spec.solidL);
  // Solid hover goes darker in light mode and lighter in dark mode.
  const Lt = (mode === "light" ? L_LIGHT : L_DARK).map((l, i) => (i === 8 ? Ls : i === 9 ? Ls + (mode === "light" ? -0.045 : 0.035) : l));
  const rel = mode === "light" ? REL_C : REL_C_DARK;
  return Lt.map((l, i) => {
    const h = (spec.hue + warmShift(spec.hue, l, Ls) + 360) % 360;
    return hex({ mode: "oklch", l, c: maxChroma(l, h) * rel[i] * vib, h });
  });
}

/** Tinted neutral: a material, not grey (e.g. Sand, Slate). `tint` scales the small absolute chroma. */
export function neutralRamp(hue: number, tint: number, mode: Mode): string[] {
  const base = mode === "light" ? [0.002, 0.003, 0.005, 0.0065, 0.008, 0.01, 0.012, 0.015, 0.018, 0.018, 0.016, 0.012] : [0.004, 0.005, 0.006, 0.007, 0.008, 0.01, 0.012, 0.014, 0.016, 0.016, 0.012, 0.006];
  const Lt = mode === "light" ? [...L_LIGHT.slice(0, 8), 0.64, 0.6, 0.5, 0.235] : [...L_DARK.slice(0, 8), 0.56, 0.6, 0.79, 0.955];
  return Lt.map((l, i) => hex({ mode: "oklch", l, c: base[i] * tint, h: hue }));
}

/** Lightest (light mode) / darkest (dark mode) neutral that still reaches `target` against *every* given background. */
function neutralAtContrast(hue: number, tint: number, bgs: string[], mode: Mode, target: number) {
  for (let i = 0; i <= 500; i++) {
    const l = mode === "light" ? 0.85 - i * 0.001 : 0.3 + i * 0.001;
    const c = hex({ mode: "oklch", l, c: 0.014 * tint, h: hue });
    if (bgs.every((bg) => contrast(c, bg) >= target)) return c;
  }
  return mode === "light" ? "#555555" : "#aaaaaa";
}

const mostReadable = (bg: string, light = "#ffffff", dark: string) => (contrast(light, bg) >= contrast(dark, bg) ? light : dark);

// ---- directions ------------------------------------------------------------------------

export type Direction = {
  key: string;
  name: string;
  story: string;
  neutral: { name: string; hue: number; tint: number };
  brand: RampSpec & { name: string };
  accent: RampSpec & { name: string }; // links + data
  good: RampSpec;
  warn: RampSpec;
  bad: RampSpec;
};

export const DIRECTIONS: Direction[] = [
  {
    key: "laligurans",
    name: "Laligurans",
    story: "Rhododendron crimson on warm Sand neutrals, with Himalayan-sky blue for links and data. Closest to the flag; warm and familiar.",
    neutral: { name: "Sand", hue: 70, tint: 1.1 },
    brand: { name: "Laligurans", hue: 2 },
    accent: { name: "Sky", hue: 248 },
    good: { hue: 150 },
    warn: { hue: 75, solidL: 0.79 },
    bad: { hue: 40, solidL: 0.5 }, // darker, more orange than the rose brand so the two never read as the same
  },
  {
    key: "indigo",
    name: "Himalayan Indigo",
    story: "Deep indigo on cool Slate neutrals: one calm accent for actions, links and data. Quiet and trustworthy, like a bank or a good SaaS tool.",
    neutral: { name: "Slate", hue: 265, tint: 1.3 },
    brand: { name: "Indigo", hue: 273 },
    accent: { name: "Indigo", hue: 273 },
    good: { hue: 152 },
    warn: { hue: 75, solidL: 0.79 },
    bad: { hue: 25 },
  },
  {
    key: "jade",
    name: "Terai Jade",
    story: "Jade green from the Terai fields on soft Sage neutrals, with marigold warmth reserved for highlights. Fresh and growth-minded.",
    neutral: { name: "Sage", hue: 150, tint: 0.9 },
    brand: { name: "Jade", hue: 172, vibrancy: 0.9 },
    accent: { name: "Azure", hue: 245 },
    good: { hue: 140 },
    warn: { hue: 72, solidL: 0.79 },
    bad: { hue: 25 },
  },
];

export function buildTheme(d: Direction, mode: Mode) {
  const n = neutralRamp(d.neutral.hue, d.neutral.tint, mode);
  const r = {
    neutral: n,
    brand: chromaticRamp(d.brand, mode),
    accent: chromaticRamp(d.accent, mode),
    good: chromaticRamp(d.good, mode),
    warn: chromaticRamp(d.warn, mode),
    bad: chromaticRamp(d.bad, mode),
  };
  const ink = n[11];
  const surface = mode === "light" ? "#ffffff" : n[1];
  const bg = mode === "light" ? n[1] : n[0];
  const semantic: Record<string, string> = {
    bg,
    surface,
    "surface-2": n[2],
    "surface-3": n[3],
    border: n[5],
    "border-strong": n[7],
    text: ink,
    "text-2": n[10],
    // Light-on-dark needs more contrast for the same readability (APCA polarity), so dark mode aims higher.
    "text-3": neutralAtContrast(d.neutral.hue, d.neutral.tint, [surface, bg, n[2]], mode, mode === "light" ? 4.55 : 6.2),
    // Form-control boundaries: WCAG 1.4.11 asks 3:1 against what they sit on.
    "control-border": neutralAtContrast(d.neutral.hue, d.neutral.tint, [surface, bg], mode, 3.05),
    brand: r.brand[8],
    "brand-hover": r.brand[9],
    "brand-ink": mostReadable(r.brand[8], "#ffffff", n[11]),
    "brand-soft": r.brand[2],
    "brand-text": r.brand[10],
    accent: r.accent[8],
    "accent-soft": r.accent[2],
    link: r.accent[10],
    good: r.good[10],
    "good-soft": r.good[2],
    "good-solid": r.good[8],
    warn: r.warn[10],
    "warn-soft": r.warn[2],
    bad: r.bad[10],
    "bad-soft": r.bad[2],
    "bad-solid": r.bad[8],
    ring: r.accent[7],
  };
  return { ramps: r, semantic };
}

export function report(d: Direction, mode: Mode) {
  const { semantic: s } = buildTheme(d, mode);
  const pairs: [string, string, string, number][] = [
    ["Body text", s.text, s.surface, 4.5],
    ["Secondary text", s["text-2"], s.surface, 4.5],
    ["Muted text", s["text-3"], s.surface, 4.5],
    ["Muted text on page", s["text-3"], s.bg, 4.5],
    ["Button label", s["brand-ink"], s.brand, 4.5],
    ["Brand text", s["brand-text"], s.surface, 4.5],
    ["Link", s.link, s.surface, 4.5],
    ["Chart line vs surface", s.accent, s.surface, 3],
    ["Muted text on fill", s["text-3"], s["surface-2"], 4.5],
    ["Input border", s["control-border"], s.surface, 3],
    ["Input border on page", s["control-border"], s.bg, 3],
    ["Success badge", s.good, s["good-soft"], 4.5],
    ["Warning badge", s.warn, s["warn-soft"], 4.5],
    ["Danger badge", s.bad, s["bad-soft"], 4.5],
    ["Info badge", s.link, s["accent-soft"], 4.5],
  ];
  const rows = pairs.map(([name, fg, bg, min]) => ({ name, fg, bg, wcag: Math.round(contrast(fg, bg) * 100) / 100, apca: apca(fg, bg), min, ok: contrast(fg, bg) >= min }));
  const brandVsDanger = Math.round(differenceEuclidean("oklab")(toOklab(s.brand)!, toOklab(s["bad-solid"])!) * 1000) / 10;
  return { rows, brandVsDanger };
}

// ---- CLI ------------------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "--json") {
    console.log(JSON.stringify(DIRECTIONS.map((d) => ({ ...d, light: buildTheme(d, "light"), dark: buildTheme(d, "dark"), reportLight: report(d, "light"), reportDark: report(d, "dark") }))));
  } else if (args[0] === "--write") {
    const d = DIRECTIONS.find((x) => x.key === args[1]);
    if (!d) throw new Error(`Unknown direction ${args[1]}`);
    const block = (mode: Mode) => {
      const { ramps, semantic } = buildTheme(d, mode);
      const ref = Object.entries(ramps).flatMap(([k, steps]) => steps.map((c, i) => `  --${k}-${i + 1}: ${c};`));
      const sem = Object.entries(semantic).map(([k, v]) => {
        const idx = Object.entries(ramps).flatMap(([rk, steps]) => steps.map((c, i) => [c, `var(--${rk}-${i + 1})`] as const)).find(([c]) => c === v);
        return `  --${k}: ${idx ? idx[1] : v};`;
      });
      return [...ref, "", "  /* semantic roles */", ...sem].join("\n");
    };
    const css = `/* Generated by scripts/palette.ts — direction "${d.name}". Don't edit by hand: change the spec and re-run.
   Neutral: ${d.neutral.name} (h ${d.neutral.hue}) · Brand: ${d.brand.name} (h ${d.brand.hue}) · Accent: ${d.accent.name} (h ${d.accent.hue}) */

:root {
${block("light")}
}

[data-theme="dark"] {
${block("dark")}
}
`;
    await Bun.write(`${import.meta.dir}/../src/palette.css`, css);
    console.log(`Wrote src/palette.css (${d.name})`);
  } else {
    for (const d of DIRECTIONS) {
      for (const mode of ["light", "dark"] as const) {
        const { rows, brandVsDanger } = report(d, mode);
        console.log(`\n${d.name} — ${mode}   (brand vs danger ΔE_ok ${brandVsDanger})`);
        for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(22)} ${r.fg} on ${r.bg}  ${String(r.wcag).padStart(5)}:1  Lc ${r.apca}`);
      }
    }
  }
}
