// Khalti ePayment (KPG-2) — https://docs.khalti.com/khalti-epayment/
import type { Mode } from "./esewa";

export const KHALTI_URLS = {
  test: "https://dev.khalti.com/api/v2",
  live: "https://khalti.com/api/v2",
} as const;

export const KHALTI_MIN_PAISA = 1000; // Rs. 10

export const toPaisa = (rupees: number) => Math.round(rupees * 100);

async function call(mode: Mode, path: string, secret: string, body: unknown, fetchImpl: typeof fetch) {
  const res = await fetchImpl(`${KHALTI_URLS[mode]}${path}`, {
    method: "POST",
    headers: { Authorization: `Key ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function errorText(data: any, status: number) {
  if (data?.detail) return String(data.detail);
  const first = Object.entries(data ?? {}).find(([k]) => k !== "error_key");
  if (first) return `${first[0]}: ${Array.isArray(first[1]) ? first[1].join(" ") : first[1]}`;
  return `HTTP ${status}`;
}

export async function initiate(
  o: {
    mode: Mode;
    secret: string;
    amount: number; // rupees
    purchaseOrderId: string;
    purchaseOrderName: string;
    returnUrl: string;
    websiteUrl: string;
    customer?: { name?: string; phone?: string; email?: string | null };
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ pidx: string; payment_url: string }> {
  const paisa = toPaisa(o.amount);
  if (paisa < KHALTI_MIN_PAISA) throw new Error("Khalti payments must be at least Rs. 10");
  const customer_info = Object.fromEntries(Object.entries(o.customer ?? {}).filter(([, v]) => v));
  const r = await call(
    o.mode,
    "/epayment/initiate/",
    o.secret,
    {
      return_url: o.returnUrl,
      website_url: o.websiteUrl,
      amount: paisa,
      purchase_order_id: o.purchaseOrderId,
      purchase_order_name: o.purchaseOrderName.slice(0, 100),
      ...(Object.keys(customer_info).length ? { customer_info } : {}),
    },
    fetchImpl,
  );
  if (!r.ok || !r.data?.pidx || !r.data?.payment_url) throw new Error(`Khalti: ${errorText(r.data, r.status)}`);
  return { pidx: r.data.pidx, payment_url: r.data.payment_url };
}

export type KhaltiLookup = { pidx?: string; total_amount?: number; status?: string; transaction_id?: string | null; refunded?: boolean };

/** Server-to-server lookup — the source of truth. Expired / canceled come back as HTTP 400 with a status. */
export async function lookup(o: { mode: Mode; secret: string; pidx: string }, fetchImpl: typeof fetch = fetch): Promise<KhaltiLookup> {
  const r = await call(o.mode, "/epayment/lookup/", o.secret, { pidx: o.pidx }, fetchImpl);
  if (r.data?.status) return r.data;
  throw new Error(`Khalti lookup failed: ${errorText(r.data, r.status)}`);
}
