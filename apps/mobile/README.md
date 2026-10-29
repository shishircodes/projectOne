# NepalShop Seller (mobile app)

The seller app for iOS and Android, built with [Expo](https://expo.dev) SDK 58 (React Native 0.88, TypeScript, Expo Router).
It talks only to the REST API at `/api/v1` (see "API (v1)" in the main README), the same one the website uses.

| Area | Screens | API |
|---|---|---|
| Sign in | Sign in, Choose a password, No store, Switch store | `POST auth/login` (`client: "mobile"`), `GET auth/session`, `POST auth/password`, `POST auth/logout`, `POST stores/:id/open` |
| Overview | KPIs, revenue by day, low stock, best sellers, channels | `GET store/stats?days=`, `GET store/counts` |
| Orders | List with status filters and search, detail, status and payment changes | `GET orders`, `GET orders/:id`, `PATCH orders/:id` |
| Inbox | Conversations (by channel), thread, replies | `GET conversations`, `GET conversations/:id`, `POST conversations/:id/replies` |
| Products | List with filters, edit price/stock/status, restock, photos from camera or library | `GET/PUT products/:id`, `GET/POST products/:id/stock`, `POST uploads` |

Tabs follow `session.user.features`: Overview needs *Sales analytics*, Orders *Orders*, Inbox *Inbox*, Products *Products & stock*. Account is always there.

## Run it on your phone (Expo Go)

1. **Start the website's dev server so your phone can reach it.** Vite only listens on `localhost` by default, so add `--host`:
   ```bash
   bun run dev --host
   ```
   Run that from the repo root. Allow Bun through the Windows firewall if asked (private networks).
2. **Install the app's packages and start Expo:**
   ```bash
   cd apps/mobile
   bun install
   bun run start
   ```
3. Install **Expo Go** (App Store / Play Store; it must support SDK 58), make sure the phone is on the **same Wi-Fi** as the computer, and scan the QR code.
4. Sign in with the showcase seller: `showcase@nepalshop.test`, password in `scripts/seed-showcase.ts` (`bun run seed:showcase` creates it).

### Which server the app uses

By default the app calls port 3000 on the computer that runs `expo start`. Expo Go already knows that computer's LAN IP (for example `http://192.168.1.20:3000`). To use another address:

- set it in `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000` (restart `bun run start` afterwards), or
- tap **Server: … · Change** on the sign-in screen. The choice is saved on the phone.

Find the LAN IP with `ipconfig` (Windows, "IPv4 Address") or `ipconfig getifaddr en0` (macOS).
With `expo start --tunnel`, the phone isn't on your network, so set `EXPO_PUBLIC_API_URL` to a public URL for the API (for example a cloudflared or ngrok tunnel to port 3000).

### Web preview (development only)

`bun run web` opens the app in a browser at http://localhost:8081. Metro forwards `/api/v1` and `/uploads` to `http://localhost:3000` (`metro.config.js`; override with `NEPALSHOP_DEV_API`), because the API doesn't allow cross-origin calls. The token goes to `localStorage` there instead of the secure store. The real app is iOS and Android.

## How it's built

- **Typed API client.** `src/api.ts` creates Hono's typed client from `import type { Api } from "~/api/app"`. Paths, params, bodies and responses all come from the API's route definitions, so a change in `src/api` that breaks the app fails `bun run typecheck` here. Only types cross over: nothing from the website's `src/` is bundled (the `~/*` path in `tsconfig.json` points at `../../src/*`).
- **One copy of Hono.** The app has no `hono` dependency of its own. It uses the repo root's (`node_modules/hono`), so the client and the API share one set of types. Metro is allowed to read it via `watchFolders` in `metro.config.js`. Run `bun install` at the repo root before working on the app.
- **Auth.** The bearer token from `POST auth/login` lives in `expo-secure-store` (Keychain / Keystore). Every request sends `Authorization: Bearer …`. Error codes route the seller (`src/session.tsx`, `app/_layout.tsx`):
  - `unauthenticated`: token cleared, back to sign in
  - `password_change_required`: Choose a password (`POST auth/password`)
  - `no_store`: "Create your store on the website" (or pick one if the account has stores but none open)
  - any other error: its readable `error` text is shown where it happened
- **Data.** TanStack Query. The badges (`store/counts`) refresh every 30 s, the inbox list every 15 s and an open chat every 5 s, plus whenever the app comes back to the foreground. The website's live updates (SSE `/events`) aren't used: React Native's `fetch` can't stream.
- **Look.** `src/theme/palette.ts` is generated from the website's `src/palette.css` (Himalayan Indigo, light and dark). After changing the palette at the repo root, run `bun run palette` here. Status badges, channel colors and the rupee format (`Rs. 12,34,567`, Nepal time) match the dashboard.
- **Photos.** `expo-image-picker` (camera or library, square crop, 70% quality), then `POST uploads` (multipart `file`), then `PUT products/:id` with the new image list. Up to 8 photos per product. The first one is the cover.

Scripts: `bun run start`, `bun run web`, `bun run typecheck`, `bun run palette`.

## Not built yet: push notifications

The app polls while it's open. Notifying a seller about new orders and messages while the app is closed needs backend work first:

1. **A device token table**, e.g. `push_tokens (id, user_id → users, session_id → sessions ON DELETE CASCADE, token text UNIQUE, platform 'ios'|'android', created_at, last_seen_at)`. Linking it to the session means signing out or revoking a token stops that phone's notifications.
2. **An endpoint** to register or refresh the phone's token, e.g. `PUT /api/v1/devices/push-token { token, platform }` (bearer only), and to remove it on sign-out (`POST auth/logout` can delete it with the session).
3. **Sending.** Where `src/server/realtime.ts` publishes `order`/`message` events today (new storefront order, paid payment, incoming chat), also send a push to the store owner's tokens through the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/) (`https://exp.host/--/api/v2/push/send`, batches of 100). Drop tokens it reports as `DeviceNotRegistered`. Respect the owner's features (no inbox pushes without *Inbox*). Put it on a small queue/retry so a slow push service never delays checkout.
4. **App side:** `expo-notifications` + `expo-device`, ask for permission after sign-in, call the endpoint with `getExpoPushTokenAsync({ projectId })`, and open the order or chat from the notification's `data`.
5. **Accounts and builds:** push needs an EAS project ID, an APNs key (Apple Developer account) and FCM credentials (Firebase). Since SDK 53, Android push doesn't work in Expo Go, so this needs a development build (`eas build --profile development`).

## Other follow-ups

- Store builds (EAS): add `eas.json`, a project ID, real icons and splash. EAS installs from the repo root because the app uses the root's `hono`.
- Creating products and manual orders from the phone (the API already supports both: `POST products`, `POST orders`).
- Reordering photos (choose the cover) and a full product editor.
