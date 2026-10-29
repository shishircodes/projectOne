import { sql } from "../src/server/db";

// Creates accounts with known passwords: local development only.
if (process.env.NODE_ENV === "production") throw new Error("Seed scripts are for local development only");

// Showcase store for demos: "Chiya Ghar", a Nepali tea & coffee shop with photos, a cover image, orders and inbox chats.
// Re-running replaces it. Leaves every other account and store alone.
// Photos are free-licence Unsplash images, linked (not downloaded). Swap in your own uploads before using it commercially.
const OWNER_EMAIL = "showcase@nepalshop.test";
const OWNER_PASSWORD = process.env.SHOWCASE_PASSWORD ?? "showcase-pass-1234";
const SLUG = "chiya-ghar";

const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const weighted = <T>(pairs: [T, number][]): T => {
  let r = Math.random() * pairs.reduce((s, p) => s + p[1], 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};
/** Unsplash CDN URL, cropped to the storefront's 4:5 product frame. */
const photo = (id: string, w = 1000, h = 1250) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

const [taken] = await sql`SELECT s.id FROM stores s JOIN users u ON u.id = s.owner_id WHERE s.slug = ${SLUG} AND u.email <> ${OWNER_EMAIL}`;
if (taken) throw new Error(`The store address "${SLUG}" belongs to another account; not touching it.`);

await sql`DELETE FROM users WHERE email = ${OWNER_EMAIL}`; // cascades to the old showcase store
const [user] = await sql`INSERT INTO users (email, name, password_hash)
  VALUES (${OWNER_EMAIL}, 'Pemba Sherpa', ${await Bun.password.hash(OWNER_PASSWORD)}) RETURNING id`;

const [store] = await sql`
  INSERT INTO stores (owner_id, name, slug, tagline, description, email, address, theme_color, banner_url, font_style, announcement,
                      delivery_fee_inside, delivery_fee_outside, free_delivery_over, cod_enabled, esewa_id, khalti_id, published)
  VALUES (${user.id}, 'Chiya Ghar', ${SLUG}, 'Small-batch Nepali tea and coffee, from the hills to your cup.',
          ${"Chiya Ghar started as a tea stall in Jhamsikhel and a habit of visiting the gardens our tea comes from.\n\nToday we buy directly from small family estates in Ilam, Dhankuta and Gulmi, pack every order by hand in Lalitpur, and deliver across Nepal. If you're not sure what to try, message us. We love talking tea."},
          'hello@chiyaghar.test', 'Jhamsikhel, Lalitpur', '#2f5d4e', ${photo("1455157823797-3019317cbcf0", 2000, 1100)}, 'classic',
          'Dashain & Tihar gift boxes are here · Free delivery over Rs. 3,000', 100, 175, 3000, true, 'chiyaghar', 'chiyaghar', true)
  RETURNING id`;

const cats = ["Tea", "Coffee", "Teaware", "Honey", "Gift boxes"];
const catIds: Record<string, string> = {};
for (const [i, name] of cats.entries()) {
  const [c] = await sql`INSERT INTO categories (store_id, name, slug, sort) VALUES (${store.id}, ${name}, ${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}, ${i}) RETURNING id`;
  catIds[name] = c.id;
}

type Item = { name: string; cat: string; price: number; compare?: number; cost: number; stock: number; photos: string[]; about: string };
const items: Item[] = [
  { name: "Ilam First Flush Black Tea, 100 g", cat: "Tea", price: 1450, compare: 1650, cost: 820, stock: 42, photos: ["1563822249366-3efb23b8e0c9", "1759523710626-199a2da96085"],
    about: "The first spring picking from a family garden at 1,800 m in Ilam. Bright, floral and muscatel, lighter than a typical black tea.\n\nBrew 1 teaspoon per cup at 90 °C for 3 minutes. Good for two or three steeps." },
  { name: "Himalayan Green Tea, 100 g", cat: "Tea", price: 1100, cost: 600, stock: 35, photos: ["1763617702099-d956f3fd8324", "1766482280244-afd07a7028fc"],
    about: "Hand-rolled green tea from Dhankuta. Fresh and grassy with a soft, sweet finish.\n\nBrew at 75–80 °C for 2 minutes. Hotter water makes it bitter." },
  { name: "Masala Chai Blend, 250 g", cat: "Tea", price: 650, cost: 300, stock: 88, photos: ["1761483281417-778013dc0177", "1693302050215-66ae33076745"],
    about: "Strong CTC tea with cardamom, cinnamon, clove, ginger and black pepper, the way it's made at home.\n\nBoil with milk and sugar for 4–5 minutes." },
  { name: "Golden Tips White Tea, 50 g", cat: "Tea", price: 2400, cost: 1500, stock: 4, photos: ["1765153743332-949b8d623d92", "1766232578330-14018a51e69f"],
    about: "Only the youngest buds, withered and dried by hand. Delicate, honeyed and very smooth. A small harvest, so stock is limited.\n\nBrew at 80 °C for 4 minutes." },
  { name: "Tulsi & Lemongrass Herbal Tea, 75 g", cat: "Tea", price: 550, cost: 240, stock: 60, photos: ["1653937855510-ec3fd2036d98"],
    about: "Caffeine-free blend of holy basil, lemongrass and a little ginger. Calming in the evening.\n\nSteep in boiling water for 5 minutes." },
  { name: "Gulmi Arabica Whole Beans, 250 g", cat: "Coffee", price: 1250, cost: 700, stock: 30, photos: ["1524350876685-274059332603", "1595950411750-1323532fe72e"],
    about: "Shade-grown arabica from smallholder farms in Gulmi, roasted every week in Lalitpur. Notes of cocoa, orange peel and brown sugar.\n\nRoast date is on every bag." },
  { name: "Nuwakot Medium Roast, Ground, 250 g", cat: "Coffee", price: 1100, compare: 1300, cost: 620, stock: 24, photos: ["1459755486867-b55449bb39ff", "1442512595331-e89e73853f31"],
    about: "Balanced and nutty, ground medium for filter, French press or moka pot." },
  { name: "Kathmandu Espresso Blend, 500 g", cat: "Coffee", price: 2100, cost: 1250, stock: 15, photos: ["1609050471053-8636409f9f5b", "1595950411750-1323532fe72e"],
    about: "A darker roast of Nepali arabica built for espresso. Syrupy with dark chocolate and a little spice. Great with milk." },
  { name: "Hand-thrown Ceramic Teapot", cat: "Teaware", price: 3200, cost: 1800, stock: 8, photos: ["1565550967973-727d4372df7c", "1562996069-90bc7c450c58"],
    about: "Made by potters in Thimi, Bhaktapur. Holds about 500 ml, enough for three cups. Each one is slightly different." },
  { name: "Glass Teapot with Infuser, 600 ml", cat: "Teaware", price: 1800, cost: 950, stock: 20, photos: ["1766232574096-4c4380105cc7", "1766232578337-ff7bdb6d1f8b"],
    about: "Heat-safe borosilicate glass with a removable steel infuser, so you can watch the leaves open." },
  { name: "Stoneware Mug, Speckled White", cat: "Teaware", price: 950, cost: 450, stock: 46, photos: ["1590422749897-47036da0b0ff", "1536936812504-0e77dc3f0b40"],
    about: "A sturdy everyday mug, 350 ml. Dishwasher and microwave safe." },
  { name: "Pour-over Coffee Kit", cat: "Teaware", price: 2600, cost: 1500, stock: 0, photos: ["1758221052634-33f352d1318b", "1759259639356-7c6e74eed1ec"],
    about: "Ceramic dripper, 40 paper filters and a measuring scoop. Back in stock soon. Message us to reserve one." },
  { name: "Wild Himalayan Honey, 500 g", cat: "Honey", price: 1350, cost: 800, stock: 26, photos: ["1587049352851-8d4e89133924", "1613548058193-1cd24c1bebcf"],
    about: "Raw multiflora honey from beekeepers in Lamjung. Unheated and unfiltered, so it may crystallise. That's a good sign." },
  { name: "Raw Honeycomb Jar, 350 g", cat: "Honey", price: 1600, cost: 1000, stock: 3, photos: ["1558642452-9d2a7deb7f62", "1642067958024-1a2d9f836920"],
    about: "A piece of whole comb in its own honey. Lovely on toast or with cheese." },
  { name: "The Morning Ritual Gift Box", cat: "Gift boxes", price: 4500, compare: 5200, cost: 2600, stock: 12, photos: ["1631008790077-f1bb3951a745", "1536788567643-8c2368376526"],
    about: "First flush black tea, Gulmi coffee beans, wild honey and a speckled mug, wrapped in lokta paper with a handwritten card.\n\nAdd your message in the order note." },
  { name: "Festival Tea Sampler, 5 teas", cat: "Gift boxes", price: 2800, cost: 1500, stock: 18, photos: ["1593522427820-c35045888f11", "1647330503232-77fc20c12375"],
    about: "Five 25 g tins: first flush, green, white, masala chai and tulsi. A good way to find a favourite, or a ready-made Dashain and Tihar gift." },
];

const prodRows: { id: string; name: string; price: number; cost_price: number }[] = [];
for (const [i, it] of items.entries()) {
  const slug = it.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Stagger created_at so "newest first" follows the list order.
  const created = new Date(Date.now() - (items.length - i) * 3600_000);
  const [p] = await sql`
    INSERT INTO products (store_id, category_id, name, slug, description, price, compare_at_price, cost_price, stock, sku, images, low_stock_threshold, created_at, updated_at)
    VALUES (${store.id}, ${catIds[it.cat]}, ${it.name}, ${slug}, ${it.about}, ${it.price}, ${it.compare ?? null}, ${it.cost}, ${it.stock},
            ${"CG-" + String(i + 1).padStart(3, "0")}, ${it.photos.map((id) => photo(id))}::jsonb, 5, ${created}, ${created})
    RETURNING id, name, price::float8 AS price, cost_price::float8 AS cost_price`;
  await sql`INSERT INTO stock_movements (store_id, product_id, change, reason) VALUES (${store.id}, ${p.id}, ${it.stock}, 'initial')`;
  prodRows.push(p);
}

// ~60 days of orders so the dashboard and analytics have something to show.
const names = ["Sita Sharma", "Ram Thapa", "Gita Gurung", "Bikash Rai", "Anita Magar", "Suman Karki", "Pooja Tamang", "Nabin Adhikari",
  "Sarita Basnet", "Rajesh Shrestha", "Kabita Limbu", "Dipesh KC", "Manisha Bhandari", "Prakash Yadav", "Sunita Chaudhary", "Aashish Joshi"];
const cities: Record<string, string[]> = {
  Bagmati: ["Kathmandu", "Lalitpur", "Bhaktapur", "Hetauda"], Gandaki: ["Pokhara", "Damauli"], Koshi: ["Biratnagar", "Dharan", "Ilam"],
  Lumbini: ["Butwal", "Nepalgunj"], Madhesh: ["Janakpur", "Birgunj"], Karnali: ["Surkhet"], Sudurpashchim: ["Dhangadhi"],
};
let seq = 1000;
const now = Date.now();
for (let day = 59; day >= 0; day--) {
  const n = Math.max(0, Math.round(rand(0, 3) + (59 - day) / 25 + (day < 10 ? 2 : 0)));
  for (let i = 0; i < n; i++) {
    const province = weighted<string>([["Bagmati", 55], ["Gandaki", 13], ["Koshi", 12], ["Lumbini", 9], ["Madhesh", 6], ["Sudurpashchim", 3], ["Karnali", 2]]);
    const city = pick(cities[province]);
    const inside = ["Kathmandu", "Lalitpur", "Bhaktapur"].includes(city);
    const source = weighted<string>([["website", 40], ["instagram", 22], ["whatsapp", 20], ["messenger", 8], ["tiktok", 7], ["walkin", 3]]);
    const status = day > 6
      ? weighted<string>([["delivered", 85], ["cancelled", 7], ["returned", 2], ["shipped", 6]])
      : weighted<string>([["pending", 35], ["confirmed", 30], ["shipped", 20], ["delivered", 15]]);
    const lines = Array.from({ length: weighted([[1, 60], [2, 28], [3, 12]]) }, () => ({ p: pick(prodRows), q: weighted([[1, 80], [2, 15], [3, 5]]) }));
    const subtotal = lines.reduce((s, l) => s + l.p.price * l.q, 0);
    const fee = subtotal >= 3000 ? 0 : inside ? 100 : 175;
    const created = new Date(now - day * 86400_000 - rand(0, 12 * 3600_000));
    const payment = source === "walkin" ? "cash" : weighted<string>([["cod", 62], ["esewa", 24], ["khalti", 14]]);
    const [o] = await sql`
      INSERT INTO orders (store_id, order_number, customer_name, customer_phone, province, city, address, inside_valley, source, status,
                          payment_method, payment_status, subtotal, delivery_fee, total, created_at, updated_at)
      VALUES (${store.id}, ${++seq}, ${pick(names)}, ${"9800" + rand(100000, 999999)}, ${province}, ${city}, 'Ward ' || ${rand(1, 32)},
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

// Inbox examples (test conversations; nothing is sent anywhere).
const chats: [string, string, string, [string, string][]][] = [
  ["whatsapp", "test-9800111222", "Sita Sharma", [["in", "Namaste! Is the Morning Ritual gift box available for Tihar?"], ["out", "Namaste Sita ji! Yes, we have 12 ready. We can add a handwritten card too."], ["in", "Perfect, can it reach Baneshwor by Friday?"]]],
  ["instagram", "test-ig-40211", "pooja.tmg", [["in", "Hi! Which tea would you suggest for someone who doesn't like bitter tea? 🙏"]]],
  ["messenger", "test-fb-77310", "Bikash Rai", [["in", "Do you deliver coffee beans to Dharan?"], ["out", "Yes! Rs. 175 outside the Valley, free over Rs. 3,000."]]],
  ["tiktok", "test-tt-5120", "chiya.lover", [["in", "Saw your white tea video, how many steeps can I get?"]]],
];
for (const [i, [channel, uid, name, msgs]] of chats.entries()) {
  const last = msgs[msgs.length - 1];
  const [c] = await sql`
    INSERT INTO conversations (store_id, channel, external_user_id, customer_name, last_message, last_message_at, unread)
    VALUES (${store.id}, ${channel}, ${uid}, ${name}, ${last[1]}, ${new Date(now - i * 3600_000)}, ${last[0] === "in" ? 1 : 0}) RETURNING id`;
  for (const [j, [dir, body]] of msgs.entries()) {
    await sql`INSERT INTO messages (conversation_id, direction, body, status, created_at)
              VALUES (${c.id}, ${dir}, ${body}, ${dir === "in" ? "received" : "test"}, ${new Date(now - i * 3600_000 - (msgs.length - j) * 120_000)})`;
  }
}

console.log(`Seeded showcase store "Chiya Ghar" (/s/${SLUG}) with ${items.length} products and ${seq - 1000} orders.`);
console.log(`Owner login: ${OWNER_EMAIL} (password in scripts/seed-showcase.ts or SHOWCASE_PASSWORD).`);
await sql.close();
