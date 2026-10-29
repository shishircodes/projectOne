# NepalShop

E-commerce platform for online sellers in Nepal: products & stock, sales analytics, a published storefront,
and one inbox for WhatsApp, Messenger, Instagram and TikTok messages.

**Stack:** [TanStack Start](https://tanstack.com/start) 1.x (React 19, Vite 8) on [Bun](https://bun.sh), PostgreSQL via Bun's
native pooled driver, Tailwind CSS v4. UI primitives from [Base UI](https://base-ui.com), toasts from [Sonner](https://sonner.emilkowal.ski),
charts from [Recharts](https://recharts.org), the ⌘K palette from [cmdk](https://cmdk.paco.me), animated KPIs from [NumberFlow](https://number-flow.barvian.me).

## Run locally

```bash
cp .env.example .env        # set DATABASE_URL and SESSION_SECRET
bun install
bun run migrate             # creates the database + schema (idempotent)
bun run seed                # optional: demo store "Himalayan Threads" (resets it each run)
bun run seed:showcase       # optional: showcase store "Chiya Ghar" at /s/chiya-ghar, with photos and orders (resets it each run)
bun run dev                 # http://localhost:3000
```

Production: `bun run build && bun run start` (TanStack's Bun server in `server.ts`: preloads static assets, gzip/ETag).

- Dashboard: `/app`. Local logins are in `scripts/seed.ts`: a store owner and a platform admin.
- Admin console: `/admin`
- Storefront: `/s/<store-slug>`, or the store's custom domain / `<slug>.BASE_DOMAIN`
- Tests: `bun test`

## Project layout

```
src/
  api/             REST API v1 (Hono): the one backend for the website and the seller mobile app
  routes/          File-based routes: pages (React) and server routes (webhooks, payment returns, /api/v1/* → api/)
    app/           Dashboard (auth-guarded layout: sidebar, ⌘K, live events)
    s/$slug/       Storefront (server-rendered); custom domains are mapped here by URL rewrite
  server/          Server-only code: db, sessions, services (SQL + business rules), channels, payments
  components/      ui/ (design-system primitives), app/ (dashboard), store/ (storefront)
  lib/             Shared: typed API client (api.ts), types, formatting (NPR, Nepal time), theme, cart, host routing
scripts/           migrate.ts, create-admin.ts, seed.ts / seed-showcase.ts (local only)
deploy/            Production: compose stack, Caddyfile, server setup, deploy and backup scripts
.github/workflows/ CI on every push, deploy on main
apps/mobile/       Seller app for iOS and Android (Expo); see apps/mobile/README.md
```

Live updates use Server-Sent Events (`/api/v1/events`), which work the same through Vite in dev and the Bun server in production.

## API (v1)

Everything the website does goes through one REST API at `/api/v1`, built with [Hono](https://hono.dev) in `src/api/`. The seller mobile app uses the same endpoints. Routes only check who is calling and pass input on; the rules live in `src/server/services/`.

- **Website:** pages call the API through the typed client in `src/lib/api.ts` (`call(api.orders.$get(...))`). In the browser that's a same-origin fetch with the session cookie. During server rendering it calls the Hono app in-process, with no network hop.
- **Mobile app:** `POST /api/v1/auth/login` with `{ email, password, client: "mobile", device_name }` returns `{ token, session, to }`. Send `Authorization: Bearer <token>` on every request and keep the token in the device's secure storage. Tokens last 90 days and extend while the app is in use. `POST /auth/logout` ends only that device's session, and disabling an account or resetting its password cuts tokens off at once.
- **Errors:** always `{ error, code? }` with a matching HTTP status. `error` is a readable message you can show. `code` is one of `unauthenticated`, `password_change_required`, `no_store`, `feature_disabled`, `forbidden`, `rate_limited`.
- **Security:** cookie-authenticated writes must come from the site's own origin. Bearer requests can't be forged cross-site, so they skip that check. Features the admin hasn't granted return `403 feature_disabled`.

| Area | Endpoints |
|---|---|
| Auth | `GET auth/config`, `GET auth/session`, `POST auth/login`, `POST auth/logout`, `POST auth/password`, `POST auth/signup` |
| Stores | `POST stores` (create), `POST stores/:id/open` (switch) |
| Open store | `GET/PUT store`, `PUT store/published`, `GET store/counts`, `GET store/stats?days=`, `GET store/search?q=` |
| Catalogue | `GET/POST categories`, `PUT/DELETE categories/:id`, `GET/POST products`, `GET products/options`, `GET/PUT/DELETE products/:id`, `PUT products/:id/status`, `GET/POST products/:id/stock` |
| Orders | `GET/POST orders`, `GET/PATCH orders/:id`, `POST orders/:id/recheck-payments` |
| Inbox | `GET conversations?channel=`, `GET conversations/unread`, `GET conversations/:id`, `POST conversations/:id/replies`, `POST conversations/test`, `GET channels`, `PUT/DELETE channels/:type` |
| Live & files | `GET events` (SSE), `POST uploads` (multipart `file`) |
| Admin | `GET/POST admin/accounts`, `POST admin/accounts/:id/stores`, `POST admin/accounts/:id/reset-password`, `PUT admin/accounts/:id/{disabled,admin,access}` |
| Storefront (public) | `GET storefront/:slug`, `GET storefront/:slug/products`, `GET storefront/:slug/products/:product`, `GET storefront/:slug/cart?ids=`, `POST storefront/:slug/orders`, `GET storefront/:slug/orders/:token`, `POST storefront/:slug/orders/:token/payments` |

The seller app in `apps/mobile` imports `type Api` from `src/api/app.ts` and type-checks against it (`cd apps/mobile && bun run typecheck`), so run that after changing routes. To try it on a phone, start the dev server with `bun run dev --host` so it's reachable on your LAN; details in `apps/mobile/README.md`.

`tests/api.test.ts` covers sign-in for both clients, permissions, cross-site protection, a product-to-order flow and token revocation.

## Accounts (private trial)

Public signup is **off** (`PUBLIC_SIGNUP=false`, the default). `/signup` shows a request-access page, using `CONTACT_EMAIL` if it's set.

- Create the first admin with `bun run create-admin -- --email you@example.com --name "Your Name"`. It prints a one-time password, which must be changed at first login. Use `--promote you@example.com` to make an existing account an admin.
- In **/admin**, admins add accounts, either with a store or leaving the person to name it themselves after signing in. The console shows each account's store and activity, and admins can create a store for an account, reset passwords (signing the person out everywhere), grant or remove admin access, and disable accounts. Admins can't disable or demote themselves.
- New and reset accounts get a one-time password (shown to the admin once, never stored in plain text). Signing in with it goes straight to *Choose your password*. Accounts without a store go to a short onboarding step.
- Disabled accounts are signed out immediately and can't log in. Their store stays online unless you also unpublish it.

### Features and store limits

Admins decide, per account, which parts of the app the person can use and how many stores they can own. Set this in **/admin → Features and store limit**, or when adding the account.

| Feature | Unlocks |
|---|---|
| Sales analytics | Overview page (revenue, profit, best sellers, alerts) |
| Products & stock | Products, categories, photos, stock tracking |
| Orders | Order list and status, manual orders |
| Inbox | Unified customer messages, replies, chat-to-order |
| Messaging channels | Connecting WhatsApp/Messenger/Instagram/TikTok (needs Inbox) |
| Online store | Publishing the website, checkout, custom domain |
| Online payments | eSewa/Khalti at checkout (needs Online store) |

- **Always available:** store settings (name, address, contact, delivery fees).
- **Enforced on the server:** every API route declares the feature it needs (`requires(...)` in `src/api/middleware.ts`), so a request for a feature that's off gets a 403 whatever the UI shows. Disallowed tabs, search results and settings sections are also hidden, and their routes redirect to the person's first allowed page.
- **Store closures:** a store whose owner lacks *Online store*, or is disabled, is closed to customers. Without *Online payments*, new eSewa/Khalti payments are refused, but already-started payments can still be verified.
- **Store limit:** the default is 1. Users under their limit create more from the store switcher (**New store**), and the switcher moves between their stores. Lowering the limit never deletes stores; it only stops new ones.

## Color system

Colors are generated, not hand-picked: `scripts/palette.ts` builds 12-step **OKLCH** ramps and writes `src/palette.css`. The shipped direction is *Himalayan Indigo*: Slate neutrals with one Indigo accent. It follows the [color-expert skill](https://github.com/meodai/skill.color-expert):

- **Ramps** use chroma as a share of the sRGB gamut available at each lightness and hue. Warm hues shift with lightness (Bezold–Brücke), and neutrals are tinted, never flat grey.
- **Semantic roles** (`surface`, `text-3`, `link`, `brand-ink`, `control-border`, status colors…) are derived from the ramps. For example, muted text is the lightest neutral that still passes 4.5:1 on every surface it sits on, and button text is whichever ink reads best on the brand fill.
- **Every pair is checked** with WCAG 2 and APCA in light and dark (`bun run palette`). `tests/palette.test.ts` fails the build if a change breaks contrast.
- **To change the look**, edit the direction spec in `scripts/palette.ts` and run `bun scripts/palette.ts --write indigo`. Don't edit `src/palette.css` by hand. Laligurans and Terai Jade are kept as alternates.
- **Storefronts** keep each store's own theme color. The platform palette styles the dashboard, admin console and landing page.

## Design system

Built following [Emil Kowalski's design-engineering skills](https://github.com/emilkowalski/skills) (emil-design-eng, apple-design, mobile-native, pick-ui-library):

- **Tokens**: color comes from the generated palette (see *Color system*); `src/styles.css` adds type, motion and shadows. Light and dark are both designed, and the theme is applied before first paint (no flash).
- **Motion**: custom ease-out / drawer curves; UI motion stays under 300 ms and exits faster than it enters. Popovers scale from their trigger; sheets enter and leave along the same edge and follow your finger when swiped. Buttons give press feedback (`scale(0.97)`). The ⌘K palette has no animation, because it's opened from the keyboard many times a day. `prefers-reduced-motion` swaps movement for fades.
- **Phone-native**: `dvh` layouts, safe-area insets, 16px inputs (no iOS zoom), no tap highlight, hover styles only on real pointers, a bottom tab bar and translucent top bar, and a sticky add-to-cart bar.
- **Forgiveness over confirmation**: reversible actions (archive, unpublish) happen at once with **Undo**; only irreversible ones (permanent delete, cancel order) ask first. Settings warn before you leave with unsaved changes.
- **State in the URL**: filters, pagination and open sheets (`?order=455`, `?product=new`) survive reloads, can be shared, and Back closes them.

## Features

| Area | What it does |
|---|---|
| Products | Add / edit / delete, photos (up to 8), SKU, sale price, cost price, draft/archived status, search & filters |
| Categories | Create, rename, nest, order; filter products and storefront by category |
| Stock | Auto-deducted on every order (row-locked, no overselling), restored on cancel/return, manual restock/adjust/damage with full history, low-stock alerts |
| Orders | Storefront checkout + manual orders from any channel, status & payment tracking, NPR totals, inside/outside Kathmandu Valley delivery fees, free-delivery threshold |
| Sales stats | Revenue (daily, Nepal time), orders, AOV, gross profit, customers, stock value, revenue by channel / province / product, order status; 7d–12m ranges with period-over-period change |
| Storefront | Server-rendered, mobile-first, SEO tags, cart, checkout with COD / eSewa / Khalti, “Order on WhatsApp”, publish toggle, owner preview, custom domains |
| Inbox | WhatsApp Cloud API, Messenger, Instagram and TikTok in one live inbox; reply from the dashboard; turn a chat into an order |

## Connecting messaging channels

One Meta app serves the whole platform; each store connects its own accounts on the **Channels** page.

1. Create a Meta app with WhatsApp, Messenger and Instagram products. Set `META_APP_SECRET` and `META_VERIFY_TOKEN` in `.env`.
2. Webhook URL: `${PUBLIC_URL}/webhooks/meta`, subscribed to `messages`. It must be public HTTPS (in development, use a tunnel such as cloudflared or ngrok).
3. In the dashboard, each store enters its WhatsApp phone number ID / Page ID / Instagram account ID and access token.
   Tokens are encrypted at rest (AES-256-GCM, derived from `SESSION_SECRET`).

WhatsApp only allows free-form replies within 24 hours of the customer's last message. Outside that window you need approved templates (not built yet).

TikTok Business Messaging is restricted to approved partners and regions. The adapter verifies TikTok's webhook signature,
but its payload field mapping and send endpoint (`TIKTOK_SEND_URL`) **must be checked against the docs for your approved app**.

Without any credentials, use **Inbox → Send a test message** to try the inbox.

## Online payments (eSewa & Khalti)

Each store sets these in **Store settings → Online payments**: a mode (Test or Live) plus its own gateway credentials.
Secrets are encrypted at rest and are never returned by the API.

| Gateway | Test mode | Live mode |
|---|---|---|
| eSewa ePay v2 | merchant code `EPAYTEST` (no secret needed) | your merchant code + secret key from eSewa |
| Khalti KPG-2 | `live_secret_key` from test-admin.khalti.com | `live_secret_key` from admin.khalti.com |

How a payment works:

1. Checkout creates the order (stock is reserved) with a private `public_token` and sends the customer to eSewa (a signed form POST) or Khalti (a `payment_url` from `epayment/initiate`).
2. The gateway sends the customer back to `/payments/esewa/return` or `/payments/khalti/return`. **That redirect is never trusted on its own.**
   - eSewa: the HMAC signature in the `data` payload must verify, *and* the server-to-server status API must report `COMPLETE` for exactly this amount, transaction id and merchant code.
   - Khalti: `epayment/lookup` must report `Completed` with `total_amount` equal to the order total in paisa.
   - Anything else stays unpaid. A completed status with the wrong amount is flagged `mismatch` and is never marked paid.
3. Only then does the order become `paid`. Its status moves from pending to confirmed, `orders.payment_ref` stores the gateway's transaction id, and the dashboard gets a live notification.

Every attempt is a row in `payments` with its own unique transaction id. Verification locks the row, so repeated or concurrent callbacks are no-ops.
Before a retry starts, earlier unfinished attempts are re-checked, so a customer who paid but closed the tab isn't charged twice.
The customer's order page (`/order/<token>`) re-checks automatically and offers **Pay again**. In the dashboard, the order shows each attempt, a **Re-check payment** button and a **Copy payment link** button (handy for orders taken on WhatsApp or Instagram).

eSewa docs quirks, confirmed against the live sandbox (Oct 2026):

- The example signatures in the docs don't match their own example input; the standard HMAC-SHA256/base64 scheme used here is what the gateway accepts.
- The UAT status host in the docs (`uat.esewa.com.np`) doesn't resolve, so test mode uses `rc-epay.esewa.com.np`.

Tests: `bun test` (unit). `ESEWA_SANDBOX=1 bun test tests/esewa.sandbox.test.ts` hits the real eSewa UAT gateway.

To try a full sandbox payment, choose eSewa at checkout and sign in with eSewa's published test account (eSewa ID `9806800001`, password `Nepal@123`, token `123456`).
For Khalti, the test IDs are `9800000000`–`9800000005`, with MPIN `1111` and OTP `987654`.

Not handled yet: automatically releasing stock for online orders that are never paid (cancel them from the dashboard), and refunds (do them in the gateway's merchant portal).

## Deploying

Production runs on one Hetzner server in Singapore: Caddy (automatic HTTPS, including store subdomains and custom domains) in front of the app container and Postgres 18, with nightly backups. GitHub Actions checks every pull request, and each push to `main` builds a Docker image, pushes it to GitHub's container registry and releases it on the server, rolling back if the new version fails its health check. Setup steps, day-to-day commands, backups and restore: [deploy/README.md](deploy/README.md).

## Scaling notes

- Stateless HTTP; sessions live in Postgres, so you can run several instances behind a load balancer.
- Live inbox updates use in-process pub/sub. With multiple instances, fan them out with Postgres `LISTEN/NOTIFY` or Redis.
- Set `S3_BUCKET` (+ `S3_*` credentials) to store images in S3/R2 instead of `./uploads`.
- Login/checkout rate limits are per-instance in memory. Move them to Redis when scaling out.
