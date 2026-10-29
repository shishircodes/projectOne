import { describe, expect, test } from "bun:test";
import { buildTheme, DIRECTIONS, report } from "../scripts/palette";

// Guards the color system: any edit to the palette spec must keep every text/background pair readable.
describe.each(DIRECTIONS.map((d) => [d.name, d] as const))("%s palette", (_name, d) => {
  for (const mode of ["light", "dark"] as const) {
    test(`all contrast pairs pass in ${mode} mode`, () => {
      const { rows } = report(d, mode);
      const failing = rows.filter((r) => !r.ok).map((r) => `${r.name}: ${r.fg} on ${r.bg} = ${r.wcag}:1 (needs ${r.min})`);
      expect(failing).toEqual([]);
    });
  }

  test("ramps have 12 steps and lightness moves one way", () => {
    for (const mode of ["light", "dark"] as const) {
      const { ramps } = buildTheme(d, mode);
      for (const steps of Object.values(ramps)) expect(steps).toHaveLength(12);
    }
  });
});

test("the shipped palette (Himalayan Indigo) keeps brand and danger clearly apart", () => {
  const indigo = DIRECTIONS.find((d) => d.key === "indigo")!;
  expect(report(indigo, "light").brandVsDanger).toBeGreaterThan(20);
  expect(report(indigo, "dark").brandVsDanger).toBeGreaterThan(20);
});
