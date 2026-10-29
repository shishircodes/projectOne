import { sql } from "../db";
import { encrypt } from "../crypto";
import { normalizeStore } from "../session";
import { bad, bool, HttpError, num, oneOf, slugify, str } from "../errors";
import { ESEWA_TEST_MERCHANT } from "../payments/esewa";
import { clearStoreCache } from "./stores";
import type { Store } from "~/lib/types";
import type { Feature } from "~/lib/features";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const RESERVED_SLUGS = new Set(["app", "api", "admin", "www", "webhooks", "uploads", "assets", "s", "login", "signup", "payments", "onboarding", "account"]);

async function uniqueStoreSlug(base: string) {
  let slug = slugify(base) || "store";
  if (RESERVED_SLUGS.has(slug)) slug += "-store";
  const rows = await sql`SELECT slug FROM stores WHERE slug = ${slug} OR slug LIKE ${slug + "-%"}`;
  const taken = new Set(rows.map((r: any) => r.slug));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}

/** Trial phase: accounts are created by platform admins unless PUBLIC_SIGNUP=true. */
export const publicSignupEnabled = () => process.env.PUBLIC_SIGNUP === "true";

export const validEmail = (raw: unknown) => {
  const email = str(raw, "Email", { required: true, max: 200 })!.toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad("Enter a valid email");
  return email;
};

export const validPassword = (raw: unknown) => {
  const password = String(raw ?? "");
  if (password.length < 8) throw bad("Password must be at least 8 characters");
  if (password.length > 200) throw bad("Password is too long");
  return password;
};

/** Create a store for a user (self-serve or by an admin), within the store limit the admin set for them. */
export async function createStore(userId: string, rawName: unknown) {
  const name = str(rawName, "Store name", { required: true, max: 100 })!;
  const [u] = await sql`
    SELECT email, max_stores, (SELECT count(*)::int FROM stores WHERE owner_id = users.id) AS owned
    FROM users WHERE id = ${userId}`;
  if (!u) throw new HttpError(404, "User not found");
  if (u.owned >= u.max_stores) {
    throw new HttpError(
      403,
      u.max_stores === 0
        ? "This account isn't allowed to create stores."
        : `This account can have ${u.max_stores} store${u.max_stores === 1 ? "" : "s"} and already has ${u.owned}. The store limit can be raised in the admin console.`,
    );
  }
  const slug = await uniqueStoreSlug(name);
  const [row] = await sql`INSERT INTO stores (owner_id, name, slug, email) VALUES (${userId}, ${name}, ${slug}, ${u.email}) RETURNING id, slug`;
  clearStoreCache();
  return row as { id: string; slug: string };
}

export async function signup(input: { name: string; email: string; storeName: string; password: string }): Promise<string> {
  if (!publicSignupEnabled()) throw new HttpError(403, "NepalShop is invite-only during the trial. Ask us for an account.");
  const name = str(input.name, "Name", { required: true, max: 100 })!;
  const email = validEmail(input.email);
  const password = validPassword(input.password);
  const [exists] = await sql`SELECT 1 FROM users WHERE email = ${email}`;
  if (exists) throw new HttpError(409, "An account with this email already exists. Log in instead.");
  const hash = await Bun.password.hash(password); // argon2id
  const [u] = await sql`INSERT INTO users (email, name, password_hash) VALUES (${email}, ${name}, ${hash}) RETURNING id`;
  await createStore(u.id, input.storeName);
  return u.id as string;
}

/** Null for wrong credentials (same answer either way, no user enumeration). */
export async function verifyLogin(input: { email: string; password: string }) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const [u] = await sql`
    SELECT u.id, u.password_hash, u.disabled, u.is_admin, u.must_change_password, EXISTS (SELECT 1 FROM stores s WHERE s.owner_id = u.id) AS has_store
    FROM users u WHERE u.email = ${email}`;
  const ok = u ? await Bun.password.verify(String(input.password ?? ""), u.password_hash) : false;
  if (!ok) return null;
  return { id: u.id as string, disabled: u.disabled as boolean, isAdmin: u.is_admin as boolean, mustChange: u.must_change_password as boolean, hasStore: u.has_store as boolean };
}

/** Change your own password. Not required to re-enter the current one only right after an admin-issued temporary password. */
export async function changePassword(userId: string, input: { current?: string; next: string }) {
  const next = validPassword(input.next);
  const [u] = await sql`SELECT password_hash, must_change_password FROM users WHERE id = ${userId}`;
  if (!u) throw new HttpError(404, "User not found");
  if (!u.must_change_password) {
    const ok = await Bun.password.verify(String(input.current ?? ""), u.password_hash);
    if (!ok) throw bad("Your current password is wrong");
  }
  if (await Bun.password.verify(next, u.password_hash)) throw bad("Choose a password different from the current one");
  await sql`UPDATE users SET password_hash = ${await Bun.password.hash(next)}, must_change_password = false WHERE id = ${userId}`;
}

export type StoreInput = Partial<Record<keyof Store, unknown>> & {
  esewa_secret_key?: string;
  khalti_secret_key?: string;
  clear_esewa?: boolean;
  clear_khalti?: boolean;
};

/** Fields tied to a feature are only changed when the owner has that feature; otherwise they keep their value. */
export async function updateStore(storeId: string, b: StoreInput, features: Feature[]): Promise<Store> {
  const canStore = features.includes("storefront");
  const canPay = features.includes("online_payments");
  const slug = slugify(str(b.slug, "Store address", { required: true, max: 60 })!);
  if (!slug || RESERVED_SLUGS.has(slug)) throw bad("Choose a different store address");
  const color = str(b.theme_color, "Theme color", { max: 7 }) ?? "#c8102e";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw bad("Theme color must be a hex color like #c8102e");
  const domain = str(b.custom_domain, "Custom domain", { max: 253 })?.toLowerCase() ?? null;
  if (domain && !HOST_RE.test(domain)) throw bad("Custom domain must look like shop.example.com");
  const logo = str(b.logo_url, "Logo", { max: 500 });
  if (logo && !/^(\/uploads\/|https:\/\/)/.test(logo)) throw bad("Logo must be an uploaded image or https URL");
  const banner = str(b.banner_url, "Cover image", { max: 500 });
  if (banner && !/^(\/uploads\/|https:\/\/)/.test(banner)) throw bad("Cover image must be an uploaded image or https URL");
  const fontStyle = oneOf(b.font_style, "Heading style", ["modern", "classic", "friendly"] as const, "modern");

  // Gateway secrets: a new value replaces the old one, blank keeps it, clear_* removes it.
  const paymentMode = oneOf(b.payment_mode, "Payment mode", ["test", "live"] as const, "test");
  const esewaCode = str(b.esewa_merchant_code, "eSewa merchant code", { max: 60 });
  if (esewaCode && !/^[\w-]+$/.test(esewaCode)) throw bad("eSewa merchant code looks invalid");
  if (paymentMode === "live" && esewaCode === ESEWA_TEST_MERCHANT.code) throw bad("EPAYTEST is eSewa's test merchant; use your live merchant code");
  const khaltiSecret = str(b.khalti_secret_key, "Khalti secret key", { max: 200 });
  const esewaSecret = str(b.esewa_secret_key, "eSewa secret key", { max: 200 });
  const clearKhalti = bool(b.clear_khalti, false);
  const clearEsewa = bool(b.clear_esewa, false);

  const [row] = await sql`
    UPDATE stores SET
      name = ${str(b.name, "Store name", { required: true, max: 100 })},
      slug = ${slug},
      tagline = ${str(b.tagline, "Tagline", { max: 160 }) ?? ""},
      description = ${str(b.description, "Description", { max: 2000 }) ?? ""},
      logo_url = ${logo},
      theme_color = ${color},
      banner_url = ${banner},
      font_style = ${fontStyle},
      announcement = ${str(b.announcement, "Announcement", { max: 120 }) ?? ""},
      phone = ${str(b.phone, "Phone", { max: 30 })},
      email = ${str(b.email, "Email", { max: 200 })},
      address = ${str(b.address, "Address", { max: 300 })},
      whatsapp_number = ${str(b.whatsapp_number, "WhatsApp number", { max: 20 })?.replace(/[^\d]/g, "") || null},
      facebook_page = ${str(b.facebook_page, "Facebook page", { max: 100 })},
      instagram_handle = ${str(b.instagram_handle, "Instagram", { max: 60 })?.replace(/^@/, "") ?? null},
      tiktok_handle = ${str(b.tiktok_handle, "TikTok", { max: 60 })?.replace(/^@/, "") ?? null},
      delivery_fee_inside = ${num(b.delivery_fee_inside, "Delivery fee (inside valley)", { min: 0, max: 100000 }) ?? 0},
      delivery_fee_outside = ${num(b.delivery_fee_outside, "Delivery fee (outside valley)", { min: 0, max: 100000 }) ?? 0},
      free_delivery_over = ${num(b.free_delivery_over, "Free delivery threshold", { min: 0 })},
      cod_enabled = CASE WHEN ${canStore} THEN ${bool(b.cod_enabled, true)} ELSE cod_enabled END,
      esewa_id = CASE WHEN ${canStore} THEN ${str(b.esewa_id, "eSewa ID", { max: 60 })} ELSE esewa_id END,
      khalti_id = CASE WHEN ${canStore} THEN ${str(b.khalti_id, "Khalti ID", { max: 60 })} ELSE khalti_id END,
      published = CASE WHEN ${canStore} THEN ${bool(b.published, false)} ELSE published END,
      custom_domain = CASE WHEN ${canStore} THEN ${domain} ELSE custom_domain END,
      payment_mode = CASE WHEN ${canPay} THEN ${paymentMode} ELSE payment_mode END,
      esewa_merchant_code = CASE WHEN ${canPay} THEN ${esewaCode} ELSE esewa_merchant_code END,
      khalti_secret_key = CASE WHEN NOT ${canPay} THEN khalti_secret_key WHEN ${clearKhalti} THEN NULL ELSE coalesce(${khaltiSecret ? encrypt(khaltiSecret) : null}, khalti_secret_key) END,
      esewa_secret_key = CASE WHEN NOT ${canPay} THEN esewa_secret_key WHEN ${clearEsewa} THEN NULL ELSE coalesce(${esewaSecret ? encrypt(esewaSecret) : null}, esewa_secret_key) END
    WHERE id = ${storeId}
    RETURNING *`;
  clearStoreCache();
  return normalizeStore(row, features);
}

/** Toggle just the published flag (from the top bar). */
export async function setPublished(storeId: string, published: boolean) {
  await sql`UPDATE stores SET published = ${published} WHERE id = ${storeId}`;
  clearStoreCache();
}
