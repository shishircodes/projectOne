import { createHmac, timingSafeEqual } from "node:crypto";

// eSewa ePay v2 — https://developer.esewa.com.np/pages/Epay
export type Mode = "test" | "live";

export const ESEWA_URLS = {
  test: {
    form: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
    // The docs list uat.esewa.com.np, which does not resolve; the UAT form host serves the status API.
    status: "https://rc-epay.esewa.com.np/api/epay/transaction/status/",
  },
  live: {
    form: "https://epay.esewa.com.np/api/epay/main/v2/form",
    status: "https://epay.esewa.com.np/api/epay/transaction/status/",
  },
} as const;

// Public UAT merchant published in eSewa's docs; only ever used in test mode.
export const ESEWA_TEST_MERCHANT = { code: "EPAYTEST", secret: "8gBm/:&EnhH.1/q" };

const REQUEST_FIELDS = "total_amount,transaction_uuid,product_code";

/** HMAC-SHA256 (base64) over "name=value,name=value" for the listed fields, in order. */
export function sign(values: Record<string, unknown>, signedFieldNames: string, secret: string): string {
  const message = signedFieldNames
    .split(",")
    .map((name) => `${name}=${values[name] ?? ""}`)
    .join(",");
  return createHmac("sha256", secret).update(message).digest("base64");
}

/** eSewa wants plain decimal strings; whole rupees stay integers ("2400"), others two decimals. */
export const formatAmount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** "1,000.0" -> 1000 */
export const parseAmount = (v: unknown) => Number(String(v ?? "").replace(/,/g, ""));

export function buildForm(o: {
  mode: Mode;
  amount: number;
  transactionUuid: string;
  productCode: string;
  secret: string;
  successUrl: string;
  failureUrl: string;
}) {
  const total = formatAmount(o.amount);
  const fields: Record<string, string> = {
    amount: total,
    tax_amount: "0",
    product_service_charge: "0",
    product_delivery_charge: "0",
    total_amount: total,
    transaction_uuid: o.transactionUuid,
    product_code: o.productCode,
    success_url: o.successUrl,
    failure_url: o.failureUrl,
    signed_field_names: REQUEST_FIELDS,
  };
  fields.signature = sign(fields, REQUEST_FIELDS, o.secret);
  return { action: ESEWA_URLS[o.mode].form, fields };
}

export type EsewaCallback = {
  transaction_code?: string;
  status?: string;
  total_amount?: string;
  transaction_uuid?: string;
  product_code?: string;
  signed_field_names?: string;
  signature?: string;
};

/** Decode the base64 `data` query param eSewa appends to success_url. */
export function decodeCallback(data: string | null): EsewaCallback | null {
  if (!data || data.length > 4000) return null;
  try {
    const obj = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

/** Recompute the response signature over its own signed_field_names and compare in constant time. */
export function verifyCallback(cb: EsewaCallback, secret: string): boolean {
  if (!cb.signature || !cb.signed_field_names) return false;
  const names = cb.signed_field_names.split(",");
  // The fields that identify the payment must be covered by the signature.
  for (const required of ["transaction_uuid", "total_amount", "product_code", "status"]) {
    if (!names.includes(required)) return false;
  }
  const expected = Buffer.from(sign(cb as Record<string, unknown>, cb.signed_field_names, secret), "base64");
  const got = Buffer.from(cb.signature, "base64");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export type EsewaStatus = { status?: string; total_amount?: number | string; transaction_uuid?: string; product_code?: string; ref_id?: string | null };

/** Server-to-server transaction status check — the source of truth. */
export async function checkStatus(
  o: { mode: Mode; productCode: string; amount: number; transactionUuid: string },
  fetchImpl: typeof fetch = fetch,
): Promise<EsewaStatus> {
  const url = new URL(ESEWA_URLS[o.mode].status);
  url.searchParams.set("product_code", o.productCode);
  url.searchParams.set("total_amount", formatAmount(o.amount));
  url.searchParams.set("transaction_uuid", o.transactionUuid);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  const body: any = await res.json().catch(() => null);
  if (!body || typeof body !== "object") throw new Error(`eSewa status check failed (HTTP ${res.status})`);
  if (body.error_message) throw new Error(`eSewa: ${body.error_message}`);
  return body;
}
