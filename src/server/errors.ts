// Errors and small input validators shared by server functions and server routes.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);

/** Map anything thrown in a server route to a JSON error response. */
export function errorResponse(e: any): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  if (isUniqueViolation(e)) return Response.json({ error: "That value is already in use" }, { status: 409 });
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

export const isUniqueViolation = (e: any) => e?.errno === "23505" || e?.code === "23505";

/** Server functions: turn DB constraint errors into readable messages, hide internals. */
export function publicError(e: any): never {
  if (e instanceof HttpError) throw e;
  if (isUniqueViolation(e)) throw new HttpError(409, "That value is already in use");
  // Router redirects / notFound pass through untouched.
  if (e && typeof e === "object" && ("isRedirect" in e || "isNotFound" in e || e instanceof Response)) throw e;
  console.error(e);
  throw new HttpError(500, "Something went wrong");
}

// ---- validators ------------------------------------------------------------------

type StrOpts = { max?: number; required?: boolean };
export function str(val: unknown, name: string, { max = 500, required = false }: StrOpts = {}): string | null {
  if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  if (typeof val !== "string" && typeof val !== "number") throw bad(`${name} must be text`);
  const s = String(val).trim();
  if (s.length > max) throw bad(`${name} must be at most ${max} characters`);
  return s;
}

type NumOpts = { min?: number; max?: number; required?: boolean };
export function num(val: unknown, name: string, { min = -Infinity, max = 1e12, required = false }: NumOpts = {}): number | null {
  if (val === undefined || val === null || val === "") {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  const n = Number(val);
  if (!Number.isFinite(n)) throw bad(`${name} must be a number`);
  if (n < min || n > max) throw bad(`${name} must be between ${min} and ${max}`);
  return Math.round(n * 100) / 100;
}

export function int(val: unknown, name: string, opts: NumOpts = {}): number | null {
  const n = num(val, name, opts);
  if (n !== null && !Number.isInteger(n)) throw bad(`${name} must be a whole number`);
  return n;
}

export function bool(val: unknown, fallback: boolean): boolean {
  if (val === undefined || val === null) return fallback;
  return val === true || val === "true" || val === 1 || val === "1" || val === "on";
}

export function oneOf<T extends string>(val: unknown, name: string, list: readonly T[], fallback?: T): T {
  if ((val === undefined || val === null || val === "") && fallback !== undefined) return fallback;
  if (!list.includes(val as T)) throw bad(`${name} must be one of: ${list.join(", ")}`);
  return val as T;
}

export function id(val: unknown, name = "id"): string {
  const s = String(val ?? "");
  if (!/^\d{1,18}$/.test(s)) throw bad(`Invalid ${name}`);
  return s;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Escape LIKE wildcards in user search input. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
