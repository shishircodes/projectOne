import { useColorScheme } from "react-native";
import { palette, type Colors } from "./palette";

export type { Colors };

/** The website's Himalayan Indigo palette, following the phone's light/dark setting. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const space = (n: number) => n * 4;

/** Type scale (matches the dashboard: system font, tabular numbers for money and counts). */
export const type = {
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15 },
  small: { fontSize: 13 },
  tiny: { fontSize: 12 },
  number: { fontVariant: ["tabular-nums"] },
} as const;

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";

export function toneColors(c: Colors, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case "good":
      return { bg: c.goodSoft, fg: c.good };
    case "warn":
      return { bg: c.warnSoft, fg: c.warn };
    case "bad":
      return { bg: c.badSoft, fg: c.bad };
    case "info":
      return { bg: c.accentSoft, fg: c.link };
    case "brand":
      return { bg: c.brandSoft, fg: c.brandText };
    default:
      return { bg: c.surface2, fg: c.text2 };
  }
}
