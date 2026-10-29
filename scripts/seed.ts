import { sql } from "../src/server/db";

// Creates accounts with known passwords: local development only.
if (process.env.NODE_ENV === "production") throw new Error("Seed scripts are for local development only");

// Demo data for local development. Re-running replaces the demo store.
const DEMO_EMAIL = "demo@nepalshop.test";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "demo-pass-1234";
// Local platform admin (no store) for trying the admin console.
const ADMIN_EMAIL = "admin@nepalshop.test";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin-pass-1234";

const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const weighted = <T>(pairs: [T, number][]): T => {
  let r = Math.random() * pairs.reduce((s, p) => s + p[1], 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

await sql`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`;
await sql`INSERT INTO users (email, name, password_hash, is_admin) VALUES (${ADMIN_EMAIL}, 'NepalShop Admin', ${await Bun.password.hash(ADMIN_PASSWORD)}, true)`;

await sql`DELETE FROM users WHERE email = ${DEMO_EMAIL}`;
const [user] = await sql`INSERT INTO users (email, name, password_hash)
  VALUES (${DEMO_EMAIL}, 'Aarati Shrestha', ${await Bun.password.hash(DEMO_PASSWORD)}) RETURNING id`;
const [store] = await sql`
  INSERT INTO stores (owner_id, name, slug, tagline, description, phone, email, address, whatsapp_number, facebook_page,
                      instagram_handle, tiktok_handle, esewa_id, khalti_id, published, free_delivery_over)
  VALUES (${user.id}, 'Himalayan Threads', 'himalayan-threads', 'Handmade in Nepal, delivered to your door',
          'Pashmina, dhaka, felt and tea from family workshops across Nepal.', '01-4221234', 'hello@himalayanthreads.test',
          'Thamel, Kathmandu', '9841234567', 'himalayanthreads', 'himalayanthreads', 'himalayanthreads', '9841234567', '9841234567',
          true, 5000)
  RETURNING id`;

const cats = ["Pashmina & Shawls", "Dhaka & Clothing", "Handicrafts", "Tea & Spices", "Accessories"];
const catIds: Record<string, string> = {};
for (const [i, name] of cats.entries()) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [c] = await sql`INSERT INTO categories (store_id, name, slug, sort) VALUES (${store.id}, ${name}, ${slug}, ${i}) RETURNING id`;
  catIds[name] = c.id;
}

const products: [string, string, number, number | null, number, number][] = [
  // name, category, price, compare_at, cost, stock
  ["Pure Pashmina Shawl – Maroon", "Pashmina & Shawls", 8500, 9500, 5200, 14],
  ["Pashmina Stole – Sky Blue", "Pashmina & Shawls", 4200, null, 2500, 22],
  ["Yak Wool Blanket", "Pashmina & Shawls", 6500, null, 4000, 3],
  ["Dhaka Topi (Palpali)", "Dhaka & Clothing", 950, null, 450, 60],
  ["Dhaka Kurta – Women", "Dhaka & Clothing", 3800, 4500, 2100, 18],
  ["Hemp Jacket", "Dhaka & Clothing", 4900, null, 2900, 0],
  ["Singing Bowl – 5 inch", "Handicrafts", 3200, null, 1700, 25],
  ["Lokta Paper Journal", "Handicrafts", 650, null, 250, 80],
  ["Felt Ball Rug (60cm)", "Handicrafts", 2800, 3200, 1500, 4],
  ["Ilam Orthodox Tea 250g", "Tea & Spices", 750, null, 380, 120],
  ["Timur (Sichuan Pepper) 100g", "Tea & Spices", 300, null, 120, 90],
  ["Himalayan Pink Salt 1kg", "Tea & Spices", 350, null, 150, 2],
  ["Rudraksha Mala", "Accessories", 1500, null, 600, 35],
  ["Khukuri Keychain", "Accessories", 450, null, 180, 50],
];
const prodRows: any[] = [];
for (const [name, cat, price, compare, cost, stock] of products) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [p] = await sql`
    INSERT INTO products (store_id, category_id, name, slug, description, price, compare_at_price, cost_price, stock, sku)
    VALUES (${store.id}, ${catIds[cat]}, ${name}, ${slug}, ${`${name}. Sourced directly from artisans in Nepal.`}, ${price}, ${compare}, ${cost},
            ${stock}, ${"HT-" + String(prodRows.length + 1).padStart(3, "0")})
    RETURNING id, name, price, cost_price`;
  await sql`INSERT INTO stock_movements (store_id, product_id, change, reason) VALUES (${store.id}, ${p.id}, ${stock}, 'initial')`;
  prodRows.push(p);
}

const names = ["Sita Sharma", "Ram Thapa", "Gita Gurung", "Bikash Rai", "Anita Magar", "Suman Karki", "Pooja Tamang", "Nabin Adhikari",
  "Sarita Basnet", "Rajesh Shrestha", "Kabita Limbu", "Dipesh KC", "Manisha Bhandari", "Prakash Yadav", "Sunita Chaudhary"];
const cities: Record<string, string[]> = {
  Bagmati: ["Kathmandu", "Lalitpur", "Bhaktapur", "Hetauda"], Gandaki: ["Pokhara", "Damauli"], Koshi: ["Biratnagar", "Dharan", "Ilam"],
  Lumbini: ["Butwal", "Nepalgunj"], Madhesh: ["Janakpur", "Birgunj"], Karnali: ["Surkhet"], Sudurpashchim: ["Dhangadhi"],
};

let seq = 1000;
const now = Date.now();
for (let day = 89; day >= 0; day--) {
  const n = Math.max(0, Math.round(rand(1, 5) + (89 - day) / 30 + (day % 7 === 5 ? 2 : 0)));
  for (let i = 0; i < n; i++) {
    const province = weighted<string>([["Bagmati", 50], ["Gandaki", 14], ["Koshi", 12], ["Lumbini", 10], ["Madhesh", 8], ["Sudurpashchim", 3], ["Karnali", 3]]);
    const city = pick(cities[province]);
    const inside = ["Kathmandu", "Lalitpur", "Bhaktapur"].includes(city);
    const source = weighted<string>([["website", 35], ["whatsapp", 25], ["instagram", 18], ["messenger", 10], ["tiktok", 9], ["walkin", 3]]);
    const status = day > 7
      ? weighted<string>([["delivered", 82], ["cancelled", 8], ["returned", 3], ["shipped", 7]])
      : weighted<string>([["pending", 35], ["confirmed", 30], ["shipped", 20], ["delivered", 15]]);
    const lines = Array.from({ length: weighted([[1, 70], [2, 22], [3, 8]]) }, () => ({ p: pick(prodRows), q: weighted([[1, 80], [2, 15], [3, 5]]) }));
    const subtotal = lines.reduce((s, l) => s + Number(l.p.price) * l.q, 0);
    const fee = subtotal >= 5000 ? 0 : inside ? 100 : 150;
    const created = new Date(now - day * 86400_000 - rand(0, 12 * 3600_000));
    const payment = source === "walkin" ? "cash" : weighted<string>([["cod", 70], ["esewa", 18], ["khalti", 12]]);
    const [o] = await sql`
      INSERT INTO orders (store_id, order_number, customer_name, customer_phone, province, city, address, inside_valley, source, status,
                          payment_method, payment_status, subtotal, delivery_fee, total, created_at, updated_at)
      VALUES (${store.id}, ${++seq}, ${pick(names)}, ${"98" + rand(10000000, 69999999)}, ${province}, ${city}, 'Ward ' || ${rand(1, 32)},
              ${inside}, ${source}, ${status}, ${payment}, ${status === "delivered" || payment !== "cod" ? "paid" : "unpaid"},
              ${subtotal}, ${fee}, ${subtotal + fee}, ${created}, ${created})
      RETURNING id`;
    for (const l of lines) {
      await sql`INSERT INTO order_items (order_id, product_id, name, price, cost_price, quantity)
                VALUES (${o.id}, ${l.p.id}, ${l.p.name}, ${l.p.price}, ${l.p.cost_price}, ${l.q})`;
    }
  }
}
await sql`UPDATE stores SET order_seq = ${seq} WHERE id = ${store.id}`;

const chats: [string, string, string, [string, string][]][] = [
  ["whatsapp", "test-9841555123", "Sita Sharma", [["in", "Namaste! Is the maroon pashmina shawl still available?"], ["out", "Namaste Sita ji! Yes, we have 14 in stock. Delivery to Kathmandu is Rs. 100."], ["in", "Great, can you deliver to Baneshwor tomorrow?"]]],
  ["instagram", "test-ig-88231", "pooja.tmg", [["in", "Hi! Do you ship singing bowls to Pokhara? 🙏"]]],
  ["messenger", "test-fb-55102", "Bikash Rai", [["in", "Price of dhaka topi?"], ["out", "Rs. 950 — Palpali dhaka, all sizes."]]],
  ["tiktok", "test-tt-1209", "trekker_np", [["in", "Saw your felt rug video, is the 60cm one in stock?"]]],
];
for (const [i, [channel, uid, name, msgs]] of chats.entries()) {
  const last = msgs[msgs.length - 1];
  const unread = last[0] === "in" ? 1 : 0;
  const [c] = await sql`
    INSERT INTO conversations (store_id, channel, external_user_id, customer_name, last_message, last_message_at, unread)
    VALUES (${store.id}, ${channel}, ${uid}, ${name}, ${last[1]}, ${new Date(now - i * 3600_000)}, ${unread}) RETURNING id`;
  for (const [j, [dir, body]] of msgs.entries()) {
    await sql`INSERT INTO messages (conversation_id, direction, body, status, created_at)
              VALUES (${c.id}, ${dir}, ${body}, ${dir === "in" ? "received" : "test"}, ${new Date(now - i * 3600_000 - (msgs.length - j) * 120_000)})`;
  }
}

console.log(`Seeded demo store "Himalayan Threads" with ${products.length} products and ${seq - 1000} orders.`);
console.log(`Store owner: ${DEMO_EMAIL}; platform admin: ${ADMIN_EMAIL} (passwords in scripts/seed.ts or SEED_PASSWORD / SEED_ADMIN_PASSWORD).`);
await sql.close();
