import { SQL } from "bun";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — copy .env.example to .env");

// Pooled Postgres client (Bun's native driver). Size the pool per instance; run several
// instances behind a load balancer to scale horizontally.
export const sql = new SQL({
  url: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeout: 30,
  connectionTimeout: 10,
});

// Stores are rendered in Nepal time by default (UTC+05:45).
export const TZ = "Asia/Kathmandu";
