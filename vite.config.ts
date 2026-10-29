import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const env = loadEnv("", process.cwd(), "");
const platformHost = (() => {
  try {
    return new URL(env.PUBLIC_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

export default defineConfig({
  server: { port: 3000 },
  // `bun` (SQL, S3, password hashing) is a runtime built-in, never bundled.
  ssr: { external: ["bun"] },
  optimizeDeps: { exclude: ["bun"] },
  // Baked into both bundles so host-based storefront routing agrees on server and client.
  define: {
    __PLATFORM_HOST__: JSON.stringify(platformHost),
    __BASE_DOMAIN__: JSON.stringify((env.BASE_DOMAIN ?? "").toLowerCase()),
  },
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
