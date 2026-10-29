import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { api } from "~/api/app";
import { sql } from "~/server/db";

// End-to-end checks of the v1 API, in-process against the real database (DATABASE_URL).
// Creates a throwaway account and store and deletes them afterwards.

const HOST = "shop.test";
const ip = `test-${crypto.randomUUID()}`; // own rate-limit bucket
const email = `api-test-${crypto.randomUUID().slice(0, 8)}@nepalshop.test`;
const password = `pw-${crypto.randomUUID()}`;
let userId = "";
let storeId = "";

type Opts = { method?: string; json?: unknown; token?: string; cookie?: string; origin?: string };
async function req(path: string, { method = "GET", json, token, cookie, origin }: Opts = {}) {
  const headers = new Headers({ host: HOST });
  if (json !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  const res = await api.fetch(new Request(`http://${HOST}/api/v1${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) }), { ip });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const login = (client?: "mobile") => req("/auth/login", { method: "POST", json: { email, password, client, device_name: "Test phone" } });

beforeAll(async () => {
  // Orders and products only: no inbox, no analytics.
  const [u] = await sql`INSERT INTO users (email, name, password_hash, features)
    VALUES (${email}, 'API Test', ${await Bun.password.hash(password)}, ${["products", "orders"]}::jsonb) RETURNING id`;
  userId = u.id;
  const [s] = await sql`INSERT INTO stores (owner_id, name, slug) VALUES (${userId}, 'API Test Store', ${`api-test-${userId}`}) RETURNING id`;
  storeId = s.id;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id = ${userId}`; // cascades to the store, its products, orders and sessions
});

describe("auth", () => {
  test("public config and empty session", async () => {
    expect((await req("/auth/config")).status).toBe(200);
    const s = await req("/auth/session");
    expect(s.status).toBe(200);
    expect(s.body).toBeNull();
  });

  test("wrong password is a 401 with a readable message", async () => {
    const r = await req("/auth/login", { method: "POST", json: { email, password: "nope" } });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/don't match/);
  });

  test("mobile login returns a bearer token and the session, no cookie", async () => {
    const r = await login("mobile");
    expect(r.status).toBe(200);
    expect(r.body.token).toStartWith("nsm_");
    expect(r.body.session.store.id).toBe(storeId);
    expect(r.body.to).toBe("/app");
    expect(r.headers.get("set-cookie")).toBeNull();
    const [row] = await sql`SELECT client, device_name FROM sessions WHERE user_id = ${userId} AND client = 'mobile'`;
    expect(row).toEqual({ client: "mobile", device_name: "Test phone" });
  });

  test("web login sets an httpOnly cookie and returns no token", async () => {
    const r = await login();
    expect(r.status).toBe(200);
    expect(r.body.token).toBeUndefined();
    expect(r.headers.get("set-cookie")).toMatch(/ns_session=.+HttpOnly/i);
  });
});

describe("permissions", () => {
  let token = "";
  beforeAll(async () => {
    token = (await login("mobile")).body.token;
  });

  test("no credentials: 401 unauthenticated", async () => {
    const r = await req("/store");
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("unauthenticated");
  });

  test("bearer token reaches the open store", async () => {
    const r = await req("/store", { token });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe("API Test Store");
    expect(r.body.khalti_secret_key).toBeUndefined();
  });

  test("features the admin didn't grant are refused", async () => {
    for (const path of ["/conversations", "/store/stats", "/channels"]) {
      const r = await req(path, { token });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("feature_disabled");
    }
    expect((await req("/orders", { token })).status).toBe(200);
    expect((await req("/admin/accounts", { token })).status).toBe(403);
  });

  test("cookie writes from another site are blocked; bearer writes are not", async () => {
    const cookie = (await login()).headers.get("set-cookie")!.split(";")[0];
    const open = `/stores/${storeId}/open`;
    expect((await req(open, { method: "POST", cookie, origin: "https://evil.example" })).status).toBe(403);
    expect((await req(open, { method: "POST", cookie, origin: `http://${HOST}` })).status).toBe(200);
    expect((await req(open, { method: "POST", token, origin: "https://evil.example" })).status).toBe(200);
  });
});

describe("store work over the API", () => {
  let token = "";
  beforeAll(async () => {
    token = (await login("mobile")).body.token;
  });

  test("bad input is a 400 with the service's message", async () => {
    const r = await req("/products", { method: "POST", token, json: { price: 100 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Name is required");
  });

  test("create a product, sell it, mark the order shipped", async () => {
    const p = await req("/products", { method: "POST", token, json: { name: "Test Tea", price: 500, stock: 10, track_stock: true, status: "active" } });
    expect(p.status).toBe(201);
    const list = await req("/products?q=Test%20Tea", { token });
    expect(list.body.items.map((x: any) => x.id)).toContain(p.body.id);

    const o = await req("/orders", {
      method: "POST",
      token,
      json: { customer_name: "Sita", customer_phone: "9800000001", items: [{ product_id: p.body.id, quantity: 2 }], source: "whatsapp", payment_method: "cod" },
    });
    expect(o.status).toBe(201);
    expect(o.body.total).toBeGreaterThanOrEqual(1000);

    const after = await req(`/products/${p.body.id}`, { token });
    expect(after.body.stock).toBe(8);

    const u = await req(`/orders/${o.body.id}`, { method: "PATCH", token, json: { status: "shipped" } });
    expect(u.status).toBe(200);
    expect((await req(`/orders/${o.body.id}`, { token })).body.status).toBe("shipped");
  });

  test("unpublished storefront reads as closed to the public", async () => {
    const r = await req(`/storefront/api-test-${userId}`);
    expect(r.status).toBe(200);
    expect(r.body.closed).toBe(true);
    expect(r.body.store).toBeNull();
  });

  test("unknown routes are JSON 404s", async () => {
    const r = await req("/nope", { token });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Not found");
  });
});

describe("revocation", () => {
  test("logout ends only that token", async () => {
    const a = (await login("mobile")).body.token;
    const b = (await login("mobile")).body.token;
    expect((await req("/auth/logout", { method: "POST", token: a })).status).toBe(200);
    expect((await req("/store", { token: a })).status).toBe(401);
    expect((await req("/store", { token: b })).status).toBe(200);
  });

  test("disabling the account cuts off existing tokens at once", async () => {
    const t = (await login("mobile")).body.token;
    await sql`UPDATE users SET disabled = true WHERE id = ${userId}`;
    try {
      expect((await req("/store", { token: t })).status).toBe(401);
    } finally {
      await sql`UPDATE users SET disabled = false WHERE id = ${userId}`;
    }
  });
});
