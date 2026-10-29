-- Idempotent schema; run with `bun run migrate`.

CREATE TABLE IF NOT EXISTS users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id             bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  slug                 text NOT NULL UNIQUE,
  tagline              text NOT NULL DEFAULT '',
  description          text NOT NULL DEFAULT '',
  logo_url             text,
  theme_color          text NOT NULL DEFAULT '#c8102e',
  phone                text,
  email                text,
  address              text,
  whatsapp_number      text,
  facebook_page        text,
  instagram_handle     text,
  tiktok_handle        text,
  delivery_fee_inside  numeric(10,2) NOT NULL DEFAULT 100,
  delivery_fee_outside numeric(10,2) NOT NULL DEFAULT 150,
  free_delivery_over   numeric(12,2),
  cod_enabled          boolean NOT NULL DEFAULT true,
  esewa_id             text,
  khalti_id            text,
  published            boolean NOT NULL DEFAULT false,
  custom_domain        text UNIQUE,
  order_seq            integer NOT NULL DEFAULT 1000,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id   bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  parent_id  bigint REFERENCES categories(id) ON DELETE SET NULL,
  name       text NOT NULL,
  slug       text NOT NULL,
  sort       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id            bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id         bigint REFERENCES categories(id) ON DELETE SET NULL,
  name                text NOT NULL,
  slug                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  sku                 text,
  price               numeric(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price    numeric(12,2),
  cost_price          numeric(12,2),
  stock               integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  track_stock         boolean NOT NULL DEFAULT true,
  images              jsonb NOT NULL DEFAULT '[]',
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug),
  UNIQUE (store_id, sku)
);
CREATE INDEX IF NOT EXISTS products_store_created_idx ON products(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_store_category_idx ON products(store_id, category_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id   bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change     integer NOT NULL,
  reason     text NOT NULL CHECK (reason IN ('initial','restock','sale','cancel','return','adjust','damage')),
  note       text,
  order_id   bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id         bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  channel          text NOT NULL CHECK (channel IN ('whatsapp','messenger','instagram','tiktok')),
  external_user_id text NOT NULL,
  customer_name    text,
  last_message     text,
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  unread           integer NOT NULL DEFAULT 0,
  UNIQUE (store_id, channel, external_user_id)
);
CREATE INDEX IF NOT EXISTS conversations_store_recent_idx ON conversations(store_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('in','out')),
  body            text NOT NULL,
  external_id     text,
  status          text NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','failed','test')),
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_uidx ON messages(conversation_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS orders (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id        bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_number    integer NOT NULL,
  customer_name   text NOT NULL,
  customer_phone  text NOT NULL,
  customer_email  text,
  province        text,
  city            text,
  address         text,
  inside_valley   boolean NOT NULL DEFAULT true,
  note            text,
  source          text NOT NULL DEFAULT 'website' CHECK (source IN ('website','whatsapp','messenger','instagram','tiktok','walkin','other')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled','returned')),
  payment_method  text NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod','esewa','khalti','bank','cash')),
  payment_status  text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  subtotal        numeric(12,2) NOT NULL,
  delivery_fee    numeric(10,2) NOT NULL DEFAULT 0,
  discount        numeric(12,2) NOT NULL DEFAULT 0,
  total           numeric(12,2) NOT NULL,
  conversation_id bigint REFERENCES conversations(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, order_number)
);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_store_status_idx ON orders(store_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id bigint REFERENCES products(id) ON DELETE SET NULL,
  name       text NOT NULL,
  price      numeric(12,2) NOT NULL,
  cost_price numeric(12,2),
  quantity   integer NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);

-- One connected account per channel type per store; external_id is the id the
-- platform sends in webhooks (WhatsApp phone_number_id, Page id, IG account id, TikTok business id).
CREATE TABLE IF NOT EXISTS channels (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id     bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('whatsapp','messenger','instagram','tiktok')),
  external_id  text NOT NULL,
  access_token text NOT NULL,
  display_name text,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, type),
  UNIQUE (type, external_id)
);

-- ---- Online payments (eSewa ePay v2, Khalti KPG-2) ---------------------------

-- Per-store gateway credentials; secrets are AES-GCM encrypted (src/crypto.ts).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'test' CHECK (payment_mode IN ('test','live'));
ALTER TABLE stores ADD COLUMN IF NOT EXISTS khalti_secret_key text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS esewa_merchant_code text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS esewa_secret_key text;

-- payment_ref: the gateway's transaction id once paid. public_token: lets the
-- customer open their order page and retry payment without an account.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token text UNIQUE;

-- One row per payment attempt. merchant_ref is our unique id sent to the gateway
-- (eSewa transaction_uuid / Khalti purchase_order_id); provider_ref is Khalti's pidx.
CREATE TABLE IF NOT EXISTS payments (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id        bigint NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id        bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('esewa','khalti')),
  mode            text NOT NULL CHECK (mode IN ('test','live')),
  merchant_ref    text NOT NULL UNIQUE,
  provider_ref    text,
  amount          numeric(12,2) NOT NULL,
  status          text NOT NULL DEFAULT 'initiated'
                  CHECK (status IN ('initiated','pending','completed','failed','refunded','mismatch')),
  provider_status text,
  provider_txn_id text,
  checked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id, created_at DESC);

-- ---- Accounts: platform admins, invite-only onboarding ---------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
-- Set when an admin creates the account or resets its password: the user picks their own on next login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by bigint REFERENCES users(id) ON DELETE SET NULL;

-- ---- Per-user access: feature flags and how many stores a user may own ---------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS max_stores integer NOT NULL DEFAULT 1 CHECK (max_stores >= 0 AND max_stores <= 100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS features jsonb NOT NULL
  DEFAULT '["analytics","products","orders","inbox","channels","storefront","online_payments"]';
-- A user may own several stores (up to max_stores); the session remembers which one is open.
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_owner_id_key;
CREATE INDEX IF NOT EXISTS stores_owner_idx ON stores(owner_id, created_at);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES stores(id) ON DELETE SET NULL;

-- Storefront look: cover image for the home page hero, heading typeface, and a one-line announcement bar.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS font_style text NOT NULL DEFAULT 'modern';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_font_style_check;
ALTER TABLE stores ADD CONSTRAINT stores_font_style_check CHECK (font_style IN ('modern','classic','friendly'));
ALTER TABLE stores ADD COLUMN IF NOT EXISTS announcement text NOT NULL DEFAULT '';

-- One sessions table for both clients: web (cookie) and the seller mobile app (bearer token).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'web';
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_client_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_client_check CHECK (client IN ('web','mobile'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_name text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
