import { storePrefixFor } from "./hosts";
import { api, call } from "./api";

/** Start (or retry) an online payment and hand the browser to the gateway. */
export async function goToPayment(slug: string, token: string) {
  const base = storePrefixFor(location.hostname) ? "" : `/s/${slug}`;
  const r = await call(api.storefront[":slug"].orders[":token"].payments.$post({ param: { slug, token }, json: { base } }));
  if ("paid" in r) return location.reload();
  if ("redirect" in r) return void location.assign(r.redirect); // Khalti
  // eSewa: POST a signed form
  const form = document.createElement("form");
  form.method = "POST";
  form.action = r.form.action;
  for (const [k, v] of Object.entries(r.form.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}
