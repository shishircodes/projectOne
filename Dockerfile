# NepalShop web app + API: one Bun process (server.ts) serving the built TanStack Start app and /api/v1.
# PUBLIC_URL and BASE_DOMAIN are baked into the bundles at build time (host-based storefront routing), so pass them
# as build args; everything else (database, secrets) is read at runtime from the environment.

FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG PUBLIC_URL=""
ARG BASE_DOMAIN=""
ENV PUBLIC_URL=$PUBLIC_URL BASE_DOMAIN=$BASE_DOMAIN
RUN bun run build

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache
COPY --from=build /app/dist ./dist
COPY server.ts tsconfig.json ./
# Server code for migrations and admin scripts (bun runs TypeScript directly).
COPY src ./src
COPY scripts/migrate.ts scripts/create-admin.ts ./scripts/
RUN mkdir -p /app/uploads && chown -R bun:bun /app/uploads
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:3000/healthz'); process.exit(r.ok ? 0 : 1)"
CMD ["bun", "server.ts"]
