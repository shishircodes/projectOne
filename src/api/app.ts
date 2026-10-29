import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApiError, identify, sameOrigin, type ApiEnv } from "./middleware";
import { HttpError, isUniqueViolation } from "~/server/errors";
import { auth, stores } from "./routes/auth";
import { store } from "./routes/store";
import { categories, products } from "./routes/catalog";
import { ordersApi } from "./routes/orders";
import { channels, conversations } from "./routes/inbox";
import { adminApi } from "./routes/admin";
import { storefront } from "./routes/storefront";
import { events, uploads } from "./routes/live";

/**
 * NepalShop REST API, v1. The only way in for both clients:
 * - the website (cookie session; pages rendered on the server call it in-process, see ~/lib/api)
 * - the seller mobile app (`Authorization: Bearer <token>` from POST /auth/login with client "mobile")
 * Business rules live in ~/server/services; these routes only check who is calling and pass input through.
 * Errors are always `{ error, code? }` with a matching HTTP status.
 */
export const api = new Hono<ApiEnv>()
  .basePath("/api/v1")
  .use(identify, sameOrigin)
  .get("/legal", (c) => {
    const legalName = process.env.LEGAL_NAME?.trim() || null;
    const email = process.env.CONTACT_EMAIL?.trim() || null;
    const address = process.env.BUSINESS_ADDRESS?.trim() || null;
    return c.json({
      legalName,
      email,
      address,
      businessNumber: process.env.BUSINESS_NUMBER?.trim() || null,
      siteUrl: (process.env.PUBLIC_URL ?? "").replace(/\/$/, ""),
      // Placeholder text must never go live unnoticed: list what's missing so the page can warn.
      missing: [!legalName && "LEGAL_NAME", !email && "CONTACT_EMAIL", !address && "BUSINESS_ADDRESS"].filter(Boolean) as string[],
      isProduction: process.env.NODE_ENV === "production",
    });
  })
  .route("/auth", auth)
  .route("/stores", stores)
  .route("/store", store)
  .route("/categories", categories)
  .route("/products", products)
  .route("/orders", ordersApi)
  .route("/conversations", conversations)
  .route("/channels", channels)
  .route("/events", events)
  .route("/uploads", uploads)
  .route("/admin", adminApi)
  .route("/storefront", storefront);

api.notFound((c) => c.json({ error: "Not found" }, 404));

api.onError((e, c) => {
  if (e instanceof ApiError) return c.json({ error: e.message, code: e.code }, e.status as 400);
  if (e instanceof HttpError) return c.json({ error: e.message }, e.status as 400);
  if (e instanceof HTTPException) return c.json({ error: e.status === 400 ? "Invalid request" : e.message }, e.status);
  if (isUniqueViolation(e)) return c.json({ error: "That value is already in use" }, 409);
  console.error(e);
  return c.json({ error: "Something went wrong" }, 500);
});

export type Api = typeof api;
