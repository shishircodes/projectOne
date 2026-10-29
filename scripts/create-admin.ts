// Create the first platform admin, or promote an existing account.
//   bun scripts/create-admin.ts --email you@example.com --name "Your Name"
//   bun scripts/create-admin.ts --promote existing@example.com
// A new admin gets a one-time password (printed once) and must choose their own at first login.
import { parseArgs } from "node:util";
import { sql } from "../src/server/db";
import { temporaryPassword } from "../src/server/services/admin";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, promote: { type: "string" } } });

if (values.promote) {
  const [u] = await sql`UPDATE users SET is_admin = true, disabled = false WHERE email = ${values.promote.toLowerCase()} RETURNING email`;
  console.log(u ? `${u.email} is now an admin.` : `No account with email ${values.promote}.`);
} else if (values.email && values.name) {
  const email = values.email.toLowerCase();
  const [exists] = await sql`SELECT 1 FROM users WHERE email = ${email}`;
  if (exists) {
    console.log(`An account with ${email} already exists. Use --promote ${email} instead.`);
  } else {
    const password = temporaryPassword();
    await sql`INSERT INTO users (email, name, password_hash, is_admin, must_change_password)
              VALUES (${email}, ${values.name}, ${await Bun.password.hash(password)}, true, true)`;
    console.log(`Admin created: ${email}`);
    console.log(`One-time password: ${password}`);
    console.log(`Sign in at /login and choose your own password.`);
  }
} else {
  console.log('Usage: bun scripts/create-admin.ts --email you@example.com --name "Your Name"\n       bun scripts/create-admin.ts --promote existing@example.com');
}
await sql.close();
