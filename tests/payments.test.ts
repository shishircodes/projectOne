import { describe, expect, test } from "bun:test";
import * as esewa from "../src/server/payments/esewa";
import * as khalti from "../src/server/payments/khalti";
import { decideEsewa, decideKhalti } from "../src/server/payments";

const UAT_SECRET = esewa.ESEWA_TEST_MERCHANT.secret;

/** Minimal fetch stand-in that records the request and returns a canned JSON response. */
function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("eSewa signatures", () => {
  test("produces the HMAC-SHA256/base64 signature eSewa expects", () => {
    // The docs' input (total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST + UAT key). Their printed
    // example signatures don't match their own input; this scheme is confirmed against the live UAT gateway
    // (it accepts these signatures and rejects others with ES104) — see tests/esewa.sandbox.test.ts.
    expect(esewa.sign({ total_amount: "100", transaction_uuid: "11-201-13", product_code: "EPAYTEST" }, "total_amount,transaction_uuid,product_code", UAT_SECRET))
      .toBe("5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=");
    // Field order follows signed_field_names, not object key order.
    expect(esewa.sign({ product_code: "EPAYTEST", transaction_uuid: "11-201-13", total_amount: "100" }, "total_amount,transaction_uuid,product_code", UAT_SECRET))
      .toBe("5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=");
  });

  test("builds a complete, signed v2 form", () => {
    const { action, fields } = esewa.buildForm({
      mode: "test", amount: 2400, transactionUuid: "NS12-abc", productCode: "EPAYTEST", secret: UAT_SECRET,
      successUrl: "https://shop.test/payments/esewa/return", failureUrl: "https://shop.test/payments/esewa/return/NS12-abc",
    });
    expect(action).toBe("https://rc-epay.esewa.com.np/api/epay/main/v2/form");
    expect(fields).toMatchObject({ amount: "2400", total_amount: "2400", tax_amount: "0", product_service_charge: "0", product_delivery_charge: "0" });
    expect(fields.signature).toBe(esewa.sign(fields, "total_amount,transaction_uuid,product_code", UAT_SECRET));
    expect(esewa.buildForm({ mode: "live", amount: 99.5, transactionUuid: "x", productCode: "M", secret: "s", successUrl: "a", failureUrl: "b" }).fields.total_amount)
      .toBe("99.50");
  });

  test("decodes the documented success payload and parses its amount", () => {
    const sample = "eyJ0cmFuc2FjdGlvbl9jb2RlIjoiMExENUNFSCIsInN0YXR1cyI6IkNPTVBMRVRFIiwidG90YWxfYW1vdW50IjoiMSwwMDAuMCIsInRyYW5zYWN0aW9uX3V1aWQiOiIyNDA2MTMtMTM0MjMxIiwicHJvZHVjdF9jb2RlIjoiTlAtRVMtQUJISVNIRUstRVBBWSIsInNpZ25lZF9maWVsZF9uYW1lcyI6InRyYW5zYWN0aW9uX2NvZGUsc3RhdHVzLHRvdGFsX2Ftb3VudCx0cmFuc2FjdGlvbl91dWlkLHByb2R1Y3RfY29kZSxzaWduZWRfZmllbGRfbmFtZXMiLCJzaWduYXR1cmUiOiJNcHd5MFRGbEhxcEpqRlVER2ljKzIybWRvZW5JVFQrQ2N6MUxDNjFxTUFjPSJ9";
    const cb = esewa.decodeCallback(sample)!;
    expect(cb).toMatchObject({ status: "COMPLETE", transaction_uuid: "240613-134231", total_amount: "1,000.0" });
    expect(esewa.parseAmount(cb.total_amount)).toBe(1000);
    expect(esewa.decodeCallback("not base64 json")).toBeNull();
    expect(esewa.decodeCallback(null)).toBeNull();
  });

  test("accepts a correctly signed callback and rejects tampering", () => {
    const names = "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";
    const cb: esewa.EsewaCallback = {
      transaction_code: "000AB1", status: "COMPLETE", total_amount: "2,400.0", transaction_uuid: "NS12-abc", product_code: "EPAYTEST", signed_field_names: names,
    };
    cb.signature = esewa.sign(cb as any, names, UAT_SECRET);
    expect(esewa.verifyCallback(cb, UAT_SECRET)).toBe(true);
    expect(esewa.verifyCallback({ ...cb, total_amount: "24,000.0" }, UAT_SECRET)).toBe(false);
    expect(esewa.verifyCallback({ ...cb, transaction_uuid: "NS99-zzz" }, UAT_SECRET)).toBe(false);
    expect(esewa.verifyCallback(cb, "some-other-secret")).toBe(false);
    expect(esewa.verifyCallback({ ...cb, signature: undefined }, UAT_SECRET)).toBe(false);

    // A signature that doesn't cover the amount/status is not good enough, even if it is valid.
    const weakNames = "transaction_uuid,product_code";
    const weak = { ...cb, signed_field_names: weakNames, signature: esewa.sign(cb as any, weakNames, UAT_SECRET) };
    expect(esewa.verifyCallback(weak, UAT_SECRET)).toBe(false);
  });
});

describe("eSewa status decisions", () => {
  const p = { amount: 2400, merchant_ref: "NS12-abc", productCode: "EPAYTEST" };
  const ok = { status: "COMPLETE", total_amount: 2400.0, transaction_uuid: "NS12-abc", product_code: "EPAYTEST", ref_id: "0007G36" };

  test("COMPLETE for our exact payment is paid", () => {
    expect(decideEsewa(p, ok)).toEqual({ outcome: "completed", providerStatus: "COMPLETE", txnId: "0007G36" });
    expect(decideEsewa(p, { ...ok, total_amount: "2,400.0" }).outcome).toBe("completed");
  });
  test("COMPLETE for a different amount, uuid or merchant is a mismatch, not paid", () => {
    expect(decideEsewa(p, { ...ok, total_amount: 10 }).outcome).toBe("mismatch");
    expect(decideEsewa(p, { ...ok, transaction_uuid: "NS13-def" }).outcome).toBe("mismatch");
    expect(decideEsewa(p, { ...ok, product_code: "OTHER" }).outcome).toBe("mismatch");
  });
  test("other statuses", () => {
    expect(decideEsewa(p, { ...ok, status: "PENDING", ref_id: null }).outcome).toBe("pending");
    expect(decideEsewa(p, { ...ok, status: "AMBIGUOUS" }).outcome).toBe("pending");
    expect(decideEsewa(p, { ...ok, status: "NOT_FOUND", ref_id: null }).outcome).toBe("failed");
    expect(decideEsewa(p, { ...ok, status: "CANCELED" }).outcome).toBe("failed");
    expect(decideEsewa(p, { ...ok, status: "FULL_REFUND" }).outcome).toBe("refunded");
    expect(decideEsewa(p, { ...ok, status: "PARTIAL_REFUND" }).outcome).toBe("refunded");
    expect(decideEsewa(p, {}).outcome).toBe("pending");
  });
});

describe("Khalti decisions", () => {
  const p = { amount: 2400, provider_ref: "pidx123" };
  const ok = { pidx: "pidx123", total_amount: 240000, status: "Completed", transaction_id: "GFq9PFS7b2iYvL8Lir9oXe", refunded: false };

  test("Completed for our exact amount (paisa) is paid", () => {
    expect(decideKhalti(p, ok)).toEqual({ outcome: "completed", providerStatus: "Completed", txnId: "GFq9PFS7b2iYvL8Lir9oXe" });
  });
  test("Completed with the wrong amount or pidx is a mismatch", () => {
    expect(decideKhalti(p, { ...ok, total_amount: 1000 }).outcome).toBe("mismatch");
    expect(decideKhalti(p, { ...ok, total_amount: 2400 }).outcome).toBe("mismatch"); // rupees instead of paisa
    expect(decideKhalti(p, { ...ok, pidx: "other" }).outcome).toBe("mismatch");
  });
  test("other statuses", () => {
    for (const s of ["Pending", "Initiated", "SomethingNew"]) expect(decideKhalti(p, { ...ok, status: s }).outcome).toBe("pending");
    for (const s of ["Expired", "User canceled"]) expect(decideKhalti(p, { ...ok, status: s }).outcome).toBe("failed");
    for (const s of ["Refunded", "Partially Refunded"]) expect(decideKhalti(p, { ...ok, status: s }).outcome).toBe("refunded");
  });
});

describe("Khalti client", () => {
  test("initiate sends paisa, Key auth and our ids to the sandbox", async () => {
    const m = mockFetch(200, { pidx: "bZQLD9wRVWo4CdESSfuSsB", payment_url: "https://test-pay.khalti.com/?pidx=bZQLD9wRVWo4CdESSfuSsB", expires_in: 1800 });
    const r = await khalti.initiate(
      { mode: "test", secret: "sk_test", amount: 2400.5, purchaseOrderId: "NS12-abc", purchaseOrderName: "Order #1446", returnUrl: "https://s.test/r", websiteUrl: "https://s.test/", customer: { name: "Hari", phone: "9851122334", email: null } },
      m.fn,
    );
    expect(r.pidx).toBe("bZQLD9wRVWo4CdESSfuSsB");
    expect(m.calls[0].url).toBe("https://dev.khalti.com/api/v2/epayment/initiate/");
    expect((m.calls[0].init!.headers as any).Authorization).toBe("Key sk_test");
    const body = JSON.parse(String(m.calls[0].init!.body));
    expect(body).toMatchObject({ amount: 240050, purchase_order_id: "NS12-abc", return_url: "https://s.test/r", customer_info: { name: "Hari", phone: "9851122334" } });
    expect(body.customer_info.email).toBeUndefined();
  });

  test("initiate refuses amounts under Rs. 10 and surfaces API errors", async () => {
    const m = mockFetch(200, {});
    await expect(khalti.initiate({ mode: "test", secret: "k", amount: 9.99, purchaseOrderId: "a", purchaseOrderName: "b", returnUrl: "c", websiteUrl: "d" }, m.fn)).rejects.toThrow("at least Rs. 10");
    expect(m.calls).toHaveLength(0);
    const bad = mockFetch(401, { detail: "Invalid token.", status_code: 401 });
    await expect(khalti.initiate({ mode: "live", secret: "k", amount: 100, purchaseOrderId: "a", purchaseOrderName: "b", returnUrl: "c", websiteUrl: "d" }, bad.fn)).rejects.toThrow("Invalid token.");
    expect(bad.calls[0].url).toStartWith("https://khalti.com/api/v2/");
  });

  test("lookup returns statuses delivered with HTTP 400 and throws on real errors", async () => {
    const expired = mockFetch(400, { pidx: "p", total_amount: 1000, status: "Expired", transaction_id: null, refunded: false });
    expect((await khalti.lookup({ mode: "test", secret: "k", pidx: "p" }, expired.fn)).status).toBe("Expired");
    const missing = mockFetch(404, { detail: "Not found.", error_key: "validation_error" });
    await expect(khalti.lookup({ mode: "test", secret: "k", pidx: "nope" }, missing.fn)).rejects.toThrow("Not found.");
  });
});

describe("eSewa status client", () => {
  test("queries the UAT status API with our exact amount and uuid", async () => {
    const m = mockFetch(200, { product_code: "EPAYTEST", transaction_uuid: "NS12-abc", total_amount: 99.5, status: "PENDING", ref_id: null });
    const r = await esewa.checkStatus({ mode: "test", productCode: "EPAYTEST", amount: 99.5, transactionUuid: "NS12-abc" }, m.fn);
    expect(r.status).toBe("PENDING");
    const u = new URL(m.calls[0].url);
    expect(u.origin + u.pathname).toBe("https://rc-epay.esewa.com.np/api/epay/transaction/status/");
    expect(Object.fromEntries(u.searchParams)).toEqual({ product_code: "EPAYTEST", total_amount: "99.50", transaction_uuid: "NS12-abc" });
  });
  test("service errors throw instead of being read as a status", async () => {
    const m = mockFetch(200, { code: 0, error_message: "Service is currently unavailable" });
    await expect(esewa.checkStatus({ mode: "live", productCode: "M", amount: 1, transactionUuid: "x" }, m.fn)).rejects.toThrow("unavailable");
  });
});
