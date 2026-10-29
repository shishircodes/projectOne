import { SQL } from "bun";

// Create the database if it does not exist yet, then apply the idempotent schema.
const url = new URL(process.env.DATABASE_URL!);
const dbName = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsupported database name: ${dbName}`);

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new SQL({ url: adminUrl.toString(), max: 1 });
const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
if (!exists) {
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database ${dbName}`);
}
await admin.close();

const { sql } = await import("../src/server/db");
await sql.unsafe(await Bun.file(`${import.meta.dir}/../src/server/schema.sql`).text()).simple();
console.log("Schema up to date");
await sql.close();
