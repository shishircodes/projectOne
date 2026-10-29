import { hc, type ClientResponse } from "hono/client";
import { notFound } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { Api } from "~/api/app";
import type { ErrorCode } from "~/api/middleware";

/**
 * Typed client for the v1 API, shared by every page. In the browser it's a normal same-origin fetch with the session
 * cookie. During server rendering it calls the Hono app in-process (no network hop), forwarding the visitor's
 * cookie and Host so sessions and custom-domain storefronts resolve exactly as they would over HTTP.
 */
const fetcher = createIsomorphicFn()
  .server(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const [{ getRequest, getRequestIP }, { api: app }] = await Promise.all([import("@tanstack/react-start/server"), import("~/api/app")]);
    const incoming = getRequest();
    const req = new Request(new URL(String(input instanceof Request ? input.url : input), "http://internal"), init);
    for (const h of ["cookie", "host", "user-agent", "accept-language"]) {
      const v = incoming.headers.get(h);
      if (v && !req.headers.has(h)) req.headers.set(h, v);
    }
    return app.fetch(req, { ip: getRequestIP({ xForwardedFor: process.env.TRUST_PROXY === "true" }) ?? undefined });
  })
  .client((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => fetch(input, { ...init, credentials: "same-origin" }));

export const api = hc<Api>("", { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetcher(input, init) }).api.v1;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: ErrorCode) {
    super(message);
  }
}

/** Where the dashboard sends you when the API says you can't be here yet. */
const REDIRECTS: Partial<Record<ErrorCode, string>> = { unauthenticated: "/login", password_change_required: "/account/password", no_store: "/onboarding" };

/**
 * Await an API call: the parsed JSON on success, an ApiError (with the server's readable message) otherwise.
 * In the browser, a lapsed session sends you to the right page instead of showing an error.
 */
export async function call<R extends ClientResponse<any, any, any>>(req: Promise<R>): Promise<R extends ClientResponse<infer T, any, any> ? T : never> {
  const res = await req;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (res.ok) return data;
  const err = new ApiError(res.status, data?.error ?? "Something went wrong", data?.code);
  const to = err.code && REDIRECTS[err.code];
  if (to && !import.meta.env.SSR && location.pathname !== to) location.assign(to);
  throw err;
}

/** For loaders: a 404 from the API becomes the router's not-found page. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw notFound();
    throw e;
  }
}

/** Query strings are text: drop empty values and stringify the rest. */
export function qs<T extends Record<string, unknown>>(o: T): { [K in keyof T]?: string } {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  return out as { [K in keyof T]?: string };
}

/** The current session (null when signed out). Used by route guards on every dashboard navigation. */
export const getSession = () => call(api.auth.session.$get());
export const logout = () => call(api.auth.logout.$post());
