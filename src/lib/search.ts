import { parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { z } from "zod";

// Clean, human-readable query strings: ?order=455&q=pashmina (no JSON quoting).
// Numbers and booleans are recovered on parse; schemas below accept either form.
const parseValue = (v: string): unknown => {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d{1,15}$/.test(v)) return Number(v);
  return v;
};
export const parseSearch = parseSearchWith(parseValue);
export const stringifySearch = stringifySearchWith((v) => (typeof v === "string" ? v : JSON.stringify(v)));

/** An id or free-text param that may arrive as a number ("455", a phone number, "1446"). */
export const textParam = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .optional()
  .catch(undefined);
