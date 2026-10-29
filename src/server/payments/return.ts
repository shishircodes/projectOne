import { sql } from "../db";
import { storePrefixFor } from "~/lib/hosts";

/** After a gateway return was verified, send the customer to their order page on the host they came from. */
export async function redirectToOrder(request: Request, pending: Promise<{ orderId: string; storeId: string; error?: string } | null>) {
  try {
    const r = await pending;
    if (!r) return new Response("Payment not found. Please return to the store and check your order.", { status: 404 });
    const [row] = await sql`SELECT o.public_token, s.slug FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.id = ${r.orderId}`;
    // On a store's own domain the store lives at "/"; on the platform host it lives at /s/<slug>.
    const onStoreHost = storePrefixFor(new URL(request.url).hostname) !== null;
    const base = onStoreHost ? "" : `/s/${row.slug}`;
    return new Response(null, { status: 303, headers: { Location: `${base}/order/${row.public_token}${r.error ? "?r=error" : ""}` } });
  } catch (e) {
    console.error("[payments] return failed", e);
    return new Response("Something went wrong confirming your payment. Please check your order page.", { status: 500 });
  }
}
