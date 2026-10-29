// Hits eSewa's public UAT sandbox. Opt in: ESEWA_SANDBOX=1 bun test tests/esewa.sandbox.test.ts
import { describe, expect, test } from "bun:test";
import { buildForm, checkStatus, ESEWA_TEST_MERCHANT, ESEWA_URLS } from "../src/server/payments/esewa";
import { decideEsewa } from "../src/server/payments";

const run = process.env.ESEWA_SANDBOX === "1" ? describe : describe.skip;

run("eSewa UAT sandbox", () => {
  const form = (uuid: string) =>
    buildForm({
      mode: "test", amount: 100, transactionUuid: uuid, productCode: ESEWA_TEST_MERCHANT.code, secret: ESEWA_TEST_MERCHANT.secret,
      successUrl: "https://example.com/ok", failureUrl: "https://example.com/fail",
    });
  const post = (fields: Record<string, string>) =>
    fetch(ESEWA_URLS.test.form, { method: "POST", body: new URLSearchParams(fields), redirect: "manual", signal: AbortSignal.timeout(20_000) });

  test("accepts our signed form (redirects to the eSewa login/booking page)", async () => {
    const res = await post(form(`NS-test-${Date.now()}`).fields);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("rc-epay.esewa.com.np/epay");
  }, 30_000);

  test("rejects a tampered amount (signature no longer matches)", async () => {
    const { fields } = form(`NS-test-${Date.now()}`);
    const res = await post({ ...fields, amount: "1", total_amount: "1" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe("ES104");
  }, 30_000);

  test("status API reports an unpaid transaction as not paid", async () => {
    const uuid = `NS-test-${Date.now()}`;
    const s = await checkStatus({ mode: "test", productCode: ESEWA_TEST_MERCHANT.code, amount: 100, transactionUuid: uuid });
    expect(decideEsewa({ amount: 100, merchant_ref: uuid, productCode: ESEWA_TEST_MERCHANT.code }, s).outcome).not.toBe("completed");
  }, 30_000);
});
