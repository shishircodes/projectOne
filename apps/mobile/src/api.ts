import Constants from "expo-constants";
import { Platform } from "react-native";
import { hc, type ClientResponse } from "hono/client";
// Types only: the API's own route definitions give every request and response its type. Nothing from src/ is bundled.
import type { Api } from "~/api/app";
import type { ErrorCode } from "~/api/middleware";

/**
 * Where the NepalShop server is.
 * 1. EXPO_PUBLIC_API_URL (in apps/mobile/.env), e.g. http://192.168.1.20:3000 or https://nepalshop.app
 * 2. In development: the machine running `expo start`, on port 3000. Expo Go already knows its LAN IP.
 * 3. The web preview uses its own origin (Metro forwards /api/v1 to the dev server).
 * The sign-in screen can override this; the choice is saved on the device.
 */
export function defaultServer(): string {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (Platform.OS === "web") return typeof location === "undefined" ? "" : location.origin;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:3000`;
}

let server = defaultServer();
let token: string | null = null;

export const getServer = () => server;
export const setServer = (url: string) => {
  server = url.trim().replace(/\/+$/, "") || defaultServer();
};
export const setToken = (t: string | null) => {
  token = t;
};

/** Absolute URL for an image the API returns (uploads come back as "/uploads/<name>"). */
export const imageUrl = (u: string) => (/^https?:\/\//.test(u) ? u : server + u);

// React Native's URLSearchParams only half-implements the spec (no .set), so the client gets its own query encoder.
const buildSearchParams = (query: Record<string, string | string[] | undefined>) => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query))
    for (const one of Array.isArray(v) ? v : [v]) if (one !== undefined) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(one)}`);
  return { toString: () => parts.join("&") } as unknown as URLSearchParams;
};

function withAuth(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return { ...init, headers };
}

/** Typed client for /api/v1. Paths, params, bodies and responses all come from the API's types. */
export const api = hc<Api>("", {
  buildSearchParams,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(server + String(input), withAuth(init)),
}).api.v1;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: ErrorCode,
  ) {
    super(message);
  }
}

/** Codes that mean "you can't be on this screen": the session provider sends the seller to the right place. */
const ROUTING_CODES: ErrorCode[] = ["unauthenticated", "password_change_required", "no_store"];
let onRoutingError: ((code: ErrorCode) => void) | null = null;
export const setRoutingErrorHandler = (fn: typeof onRoutingError) => {
  onRoutingError = fn;
};

const offline = () => new ApiError(0, `Can't reach NepalShop at ${server}. Check your connection and try again.`);

async function parse(res: Response) {
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (res.ok) return data;
  const err = new ApiError(res.status, data?.error ?? `Something went wrong (${res.status})`, data?.code);
  if (err.code && ROUTING_CODES.includes(err.code)) onRoutingError?.(err.code);
  throw err;
}

/** Await an API call: the parsed JSON on success, an ApiError with the server's readable message otherwise. */
export async function call<R extends ClientResponse<any, any, any>>(req: Promise<R>): Promise<R extends ClientResponse<infer T, any, any> ? T : never> {
  let res: R;
  try {
    res = await req;
  } catch {
    throw offline();
  }
  return parse(res as unknown as Response);
}

/** Response type of a client call, e.g. Data<typeof api.orders.$get>. */
export type Data<F extends (...args: any) => Promise<ClientResponse<any, any, any>>> = Awaited<ReturnType<F>> extends ClientResponse<infer T, any, any> ? T : never;

type UploadResult = Data<typeof api.uploads.$post>;

/**
 * Upload a photo (POST /uploads, multipart `file`). Returns its URL as the API stores it ("/uploads/..." or S3).
 * The typed client has no multipart body for this route, so it's a plain fetch; the result type still comes from the API.
 */
export async function uploadImage(photo: { uri: string; mimeType?: string | null; fileName?: string | null }): Promise<UploadResult> {
  const type = photo.mimeType || "image/jpeg";
  const name = photo.fileName || `photo-${Date.now()}.${type.split("/")[1] ?? "jpg"}`;
  const form = new FormData();
  if (Platform.OS === "web") {
    form.append("file", new File([await (await fetch(photo.uri)).blob()], name, { type }));
  } else {
    // React Native's FormData streams the file from its URI.
    form.append("file", { uri: photo.uri, name, type } as unknown as Blob);
  }
  let res: Response;
  try {
    res = await fetch(server + "/api/v1/uploads", withAuth({ method: "POST", body: form }));
  } catch {
    throw offline();
  }
  return parse(res);
}
