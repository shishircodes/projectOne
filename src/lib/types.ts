// Domain types shared by server functions and the UI. Ids are strings (Postgres bigint).
import type { Feature } from "./features";

export const PROVINCES = ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"] as const;
export const SOURCES = ["website", "whatsapp", "messenger", "instagram", "tiktok", "walkin", "other"] as const;
export const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"] as const;
export const PAYMENT_METHODS = ["cod", "esewa", "khalti", "bank", "cash"] as const;
export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export const CHANNELS = ["whatsapp", "messenger", "instagram", "tiktok"] as const;
export const PRODUCT_STATUSES = ["active", "draft", "archived"] as const;

export type Province = (typeof PROVINCES)[number];
export type Source = (typeof SOURCES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type Channel = (typeof CHANNELS)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const FONT_STYLES = [
  { value: "modern", label: "Modern", hint: "Clean and simple" },
  { value: "classic", label: "Classic", hint: "Elegant serif" },
  { value: "friendly", label: "Friendly", hint: "Bold and playful" },
] as const;
export type FontStyle = (typeof FONT_STYLES)[number]["value"];

export type Store = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logo_url: string | null;
  theme_color: string;
  banner_url: string | null;
  font_style: FontStyle;
  announcement: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  whatsapp_number: string | null;
  facebook_page: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  delivery_fee_inside: number;
  delivery_fee_outside: number;
  free_delivery_over: number | null;
  cod_enabled: boolean;
  esewa_id: string | null;
  khalti_id: string | null;
  published: boolean;
  custom_domain: string | null;
  payment_mode: "test" | "live";
  esewa_merchant_code: string | null;
  khalti_secret_set: boolean;
  esewa_secret_set: boolean;
  khalti_online: boolean;
  esewa_online: boolean;
  created_at: string;
  /** Storefront lookups only: the owner has the Online store feature and isn't disabled. */
  storefront_enabled?: boolean;
};

export type User = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  must_change_password: boolean;
  /** Features the admin turned on for this user. */
  features: Feature[];
  /** How many stores this user may own. */
  max_stores: number;
};
export type StoreRef = { id: string; name: string; slug: string; published: boolean };
/** A signed-in user; store is the one currently open (null until one exists). */
export type Session = { user: User; store: Store | null; stores: StoreRef[] };
/** Inside the store dashboard the store always exists. */
export type StoreSession = { user: User; store: Store; stores: StoreRef[] };

export type Category = { id: string; name: string; slug: string; parent_id: string | null; sort: number; product_count: number };

export type Product = {
  id: string;
  category_id: string | null;
  category_name?: string | null;
  name: string;
  slug: string;
  description: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  track_stock: boolean;
  images: string[];
  status: ProductStatus;
  updated_at: string;
};

export type StockMovement = {
  id: string;
  change: number;
  reason: "initial" | "restock" | "sale" | "cancel" | "return" | "adjust" | "damage";
  note: string | null;
  created_at: string;
  order_number: number | null;
};

export type OrderSummary = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  source: Source;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total: number;
  item_count: number;
  created_at: string;
};

export type PaymentAttempt = {
  id: string;
  provider: "esewa" | "khalti";
  mode: "test" | "live";
  merchant_ref: string;
  amount: number;
  status: "initiated" | "pending" | "completed" | "failed" | "refunded" | "mismatch";
  provider_status: string | null;
  provider_txn_id: string | null;
  created_at: string;
};

export type Order = OrderSummary & {
  customer_email: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  inside_valley: boolean;
  note: string | null;
  payment_ref: string | null;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  conversation_id: string | null;
  public_token: string | null;
  items: { id: string; product_id: string | null; name: string; price: number; quantity: number }[];
  payments: PaymentAttempt[];
};

export type Conversation = {
  id: string;
  channel: Channel;
  external_user_id: string;
  customer_name: string | null;
  last_message: string | null;
  last_message_at: string;
  unread: number;
};

export type Message = {
  id: string;
  direction: "in" | "out";
  body: string;
  status: "received" | "sent" | "failed" | "test";
  error: string | null;
  created_at: string;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
