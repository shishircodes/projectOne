import { randomBytes } from "node:crypto";
import { sql } from "../db";
import { decrypt } from "../crypto";
import { publish } from "../realtime";
import { bad, HttpError } from "../errors";
import * as esewa from "./esewa";
import * as khalti from "./khalti";
import type { Mode } from "./esewa";

export type Provider = "esewa" | "khalti";
type Outcome = "completed" | "pending" | "failed" | "refunded" | "mismatch";
type Decision = { outcome: Outcome; providerStatus: string; txnId: string | null };

// ---- pure decisions (unit-tested) ------------------------------------------------

/** Only a COMPLETE status for exactly our amount, uuid and merchant counts as paid. */
export function decideEsewa(p: { amount: number; merchant_ref: string; productCode: string }, s: esewa.EsewaStatus): Decision {
  const st = String(s.status ?? "UNKNOWN").toUpperCase();
  const txnId = s.ref_id ?? null;
  if (st === "COMPLETE") {
    const same =
      Math.abs(esewa.parseAmount(s.total_amount) - p.amount) < 0.005 &&
      s.transaction_uuid === p.merchant_ref &&
      s.product_code === p.productCode;
    return { outcome: same ? "completed" : "mismatch", providerStatus: st, txnId };
  }
  if (st === "FULL_REFUND" || st === "PARTIAL_REFUND") return { outcome: "refunded", providerStatus: st, txnId };
  if (st === "NOT_FOUND" || st === "CANCELED") return { outcome: "failed", providerStatus: st, txnId };
  return { outcome: "pending", providerStatus: st, txnId }; // PENDING, AMBIGUOUS, anything new: hold
}

/** Only "Completed" for exactly our amount (in paisa) counts as paid. */
export function decideKhalti(p: { amount: number; provider_ref: string }, l: khalti.KhaltiLookup): Decision {
  const st = String(l.status ?? "Unknown");
  const txnId = l.transaction_id ?? null;
  if (st === "Completed") {
    const same = l.pidx === p.provider_ref && Number(l.total_amount) === khalti.toPaisa(p.amount);
    return { outcome: same ? "completed" : "mismatch", providerStatus: st, txnId };
  }
  if (st === "Refunded" || st === "Partially Refunded") return { outcome: "refunded", providerStatus: st, txnId };
  if (st === "Expired" || st === "User canceled" || st === "Canceled" || st === "Failed") return { outcome: "failed", providerStatus: st, txnId };
  return { outcome: "pending", providerStatus: st, txnId }; // Initiated, Pending, unknown: hold
}

// ---- credentials -----------------------------------------------------------------

type Creds = {
  mode: Mode;
  khalti: { secret: string } | null;
  esewa: { code: string; secret: string } | null;
};

/** Which gateways a store can take online. Mirrors the flags normalizeStore() exposes. */
function onlineFlags(row: any) {
  const code = row.esewa_merchant_code;
  return {
    khalti_online: !!row.khalti_secret_key,
    esewa_online: !!code && (!!row.esewa_secret_key || (row.payment_mode === "test" && code === esewa.ESEWA_TEST_MERCHANT.code)),
  };
}

async function credentials(storeId: string, mode?: Mode): Promise<Creds> {
  const [row] = await sql`SELECT payment_mode, khalti_secret_key, esewa_merchant_code, esewa_secret_key FROM stores WHERE id = ${storeId}`;
  if (!row) throw new HttpError(404, "Store not found");
  const m: Mode = mode ?? row.payment_mode;
  const flags = onlineFlags({ ...row, payment_mode: m });
  return {
    mode: m,
    khalti: flags.khalti_online ? { secret: decrypt(row.khalti_secret_key) } : null,
    esewa: flags.esewa_online
      ? { code: row.esewa_merchant_code, secret: row.esewa_secret_key ? decrypt(row.esewa_secret_key) : esewa.ESEWA_TEST_MERCHANT.secret }
      : null,
  };
}

// ---- recording results (idempotent) ---------------------------------------------

/** Apply a gateway decision to a payment attempt. Safe to call repeatedly / concurrently. */
async function record(paymentId: string, d: Decision) {
  const result = await sql.begin(async (tx) => {
    const [p] = await tx`SELECT id, store_id, order_id, status FROM payments WHERE id = ${paymentId} FOR UPDATE`;
    if (!p) return null;
    // A completed attempt only moves to refunded; nothing else can undo it.
    if (p.status === "completed" && d.outcome !== "refunded") return { changed: false, paid: true, p };
    await tx`UPDATE payments SET status = ${d.outcome}, provider_status = ${d.providerStatus},
               provider_txn_id = coalesce(${d.txnId}, provider_txn_id), checked_at = now(), updated_at = now()
             WHERE id = ${paymentId}`;
    if (d.outcome === "completed") {
      const [o] = await tx`
        UPDATE orders SET payment_status = 'paid', payment_ref = coalesce(payment_ref, ${d.txnId}),
          status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END, updated_at = now()
        WHERE id = ${p.order_id}
        RETURNING id, order_number, total::float8 AS total, customer_name, payment_method`;
      return { changed: true, paid: true, p, order: o };
    }
    if (d.outcome === "refunded") {
      await tx`UPDATE orders SET payment_status = 'refunded', updated_at = now() WHERE id = ${p.order_id} AND payment_status = 'paid'`;
    }
    return { changed: p.status !== d.outcome, paid: false, p };
  });
  if (result?.changed && result.order) publish(result.p.store_id, "order:paid", result.order);
  if (d.outcome === "mismatch") console.warn(`[payments] amount/identity mismatch on payment ${paymentId}`, d);
  return result;
}

/** Ask the gateway about one attempt and record the answer. */
export async function verifyPayment(paymentId: string) {
  const [p] = await sql`SELECT id, store_id, provider, mode, merchant_ref, provider_ref, amount::float8 AS amount, status
                        FROM payments WHERE id = ${paymentId}`;
  if (!p) return null;
  if (p.status === "completed" || p.status === "refunded") return p.status;
  const creds = await credentials(p.store_id, p.mode);
  let d: Decision;
  if (p.provider === "khalti") {
    if (!creds.khalti || !p.provider_ref) return p.status;
    d = decideKhalti(p, await khalti.lookup({ mode: p.mode, secret: creds.khalti.secret, pidx: p.provider_ref }));
  } else {
    if (!creds.esewa) return p.status;
    const s = await esewa.checkStatus({ mode: p.mode, productCode: creds.esewa.code, amount: p.amount, transactionUuid: p.merchant_ref });
    d = decideEsewa({ ...p, productCode: creds.esewa.code }, s);
  }
  await record(p.id, d);
  return d.outcome;
}

/** Re-check every unfinished attempt of an order (used before retries and by the dashboard). */
export async function verifyOrderPayments(orderId: string) {
  const open = await sql`SELECT id FROM payments WHERE order_id = ${orderId} AND status IN ('initiated','pending')
                         ORDER BY created_at DESC LIMIT 5`;
  const errors: string[] = [];
  for (const p of open) {
    try {
      await verifyPayment(p.id);
    } catch (e: any) {
      errors.push(e.message);
    }
  }
  return errors;
}

// ---- starting a payment ------------------------------------------------------------

export const newOrderToken = () => randomBytes(16).toString("base64url");

export async function startPayment(o: {
  storeId: string;
  token: string;
  origin: string; // where the customer is browsing (return URLs come back here)
  websiteUrl: string;
}): Promise<{ paid: true } | { redirect: string } | { form: { action: string; fields: Record<string, string> } }> {
  const [order] = await sql`
    SELECT id, order_number, status, payment_method, payment_status, total::float8 AS total, customer_name, customer_phone, customer_email
    FROM orders WHERE store_id = ${o.storeId} AND public_token = ${o.token}`;
  if (!order) throw new HttpError(404, "Order not found");
  if (order.payment_status === "paid") return { paid: true };
  if (order.status === "cancelled" || order.status === "returned") throw bad("This order was cancelled");
  const provider = order.payment_method as Provider;
  if (provider !== "esewa" && provider !== "khalti") throw bad("This order is not paid online");
  // New payments need the Online payments feature on the store owner's account (checking old ones never does).
  const [owner] = await sql`SELECT u.features FROM stores s JOIN users u ON u.id = s.owner_id WHERE s.id = ${o.storeId}`;
  if (!Array.isArray(owner?.features) || !owner.features.includes("online_payments")) {
    throw bad("Online payment isn't available for this store. Please pay on delivery or contact the store.");
  }

  // A previous attempt may have succeeded even though the customer never came back.
  await verifyOrderPayments(order.id);
  const [fresh] = await sql`SELECT payment_status FROM orders WHERE id = ${order.id}`;
  if (fresh.payment_status === "paid") return { paid: true };

  const creds = await credentials(o.storeId);
  const merchantRef = `NS${order.id}-${randomBytes(5).toString("hex")}`; // alphanumeric + hyphen, unique per attempt

  if (provider === "esewa") {
    if (!creds.esewa) throw bad("eSewa online payment is not available for this store");
    await sql`INSERT INTO payments (store_id, order_id, provider, mode, merchant_ref, amount)
              VALUES (${o.storeId}, ${order.id}, 'esewa', ${creds.mode}, ${merchantRef}, ${order.total})`;
    return {
      form: esewa.buildForm({
        mode: creds.mode,
        amount: order.total,
        transactionUuid: merchantRef,
        productCode: creds.esewa.code,
        secret: creds.esewa.secret,
        successUrl: `${o.origin}/payments/esewa/return`,
        // Ref goes in the path: eSewa appends its own query string to these URLs.
        failureUrl: `${o.origin}/payments/esewa/return/${merchantRef}`,
      }),
    };
  }

  if (!creds.khalti) throw bad("Khalti online payment is not available for this store");
  const init = await khalti
    .initiate({
    mode: creds.mode,
    secret: creds.khalti.secret,
    amount: order.total,
    purchaseOrderId: merchantRef,
    purchaseOrderName: `Order #${order.order_number}`,
    returnUrl: `${o.origin}/payments/khalti/return`,
    websiteUrl: o.websiteUrl,
    customer: { name: order.customer_name, phone: order.customer_phone, email: order.customer_email },
    })
    .catch((e) => {
      // Gateway/config problem (bad key, Khalti down): log the detail, give the customer something actionable.
      console.error(`[payments] Khalti initiate failed for store ${o.storeId}:`, e.message);
      throw new HttpError(502, "Khalti payment could not be started. Please try again shortly or contact the store.");
    });
  await sql`INSERT INTO payments (store_id, order_id, provider, mode, merchant_ref, provider_ref, amount)
            VALUES (${o.storeId}, ${order.id}, 'khalti', ${creds.mode}, ${merchantRef}, ${init.pidx}, ${order.total})`;
  return { redirect: init.payment_url };
}

// ---- gateway return handlers --------------------------------------------------------

/** eSewa success (?data=base64 JSON) or failure (/return/:ref) redirect. Returns the order to show. */
export async function handleEsewaReturn(url: URL, failureRef?: string) {
  const cb = esewa.decodeCallback(url.searchParams.get("data"));
  const ref = cb?.transaction_uuid ?? failureRef;
  if (!ref) return null;
  const [p] = await sql`SELECT id, store_id, order_id, mode FROM payments WHERE merchant_ref = ${ref} AND provider = 'esewa'`;
  if (!p) return null;
  if (cb) {
    const creds = await credentials(p.store_id, p.mode);
    if (!creds.esewa || !esewa.verifyCallback(cb, creds.esewa.secret)) {
      console.warn(`[payments] invalid eSewa callback signature for ${ref}`);
      return { orderId: p.order_id, storeId: p.store_id, error: "We could not verify this payment response." };
    }
  }
  // The redirect itself is never trusted; the status API decides.
  try {
    await verifyPayment(p.id);
  } catch (e: any) {
    return { orderId: p.order_id, storeId: p.store_id, error: `Could not confirm the payment yet (${e.message}).` };
  }
  return { orderId: p.order_id, storeId: p.store_id };
}

export async function handleKhaltiReturn(url: URL) {
  const pidx = url.searchParams.get("pidx");
  if (!pidx) return null;
  const [p] = await sql`SELECT id, store_id, order_id FROM payments WHERE provider = 'khalti' AND provider_ref = ${pidx}`;
  if (!p) return null;
  try {
    await verifyPayment(p.id);
  } catch (e: any) {
    return { orderId: p.order_id, storeId: p.store_id, error: `Could not confirm the payment yet (${e.message}).` };
  }
  return { orderId: p.order_id, storeId: p.store_id };
}
