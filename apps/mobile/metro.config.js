// Metro config for the seller app.
const path = require("node:path");
const http = require("node:http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The API client (hono/client) comes from the website's own install at the repo root, so the app and the API always
// share one copy of Hono's types. Metro finds it by walking up node_modules; it only needs to be allowed to read it.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../../node_modules/hono")];

// Web preview only (`bun run web`): the browser can't call another port without CORS, which the API doesn't allow.
// So in development Metro forwards /api/v1 and /uploads to the dev server. Phones call the API directly and skip this.
const target = new URL(process.env.NEPALSHOP_DEV_API ?? "http://localhost:3000");
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (!/^\/(api\/v1|uploads)\//.test(req.url ?? "")) return middleware(req, res, next);
    const headers = { ...req.headers, host: target.host };
    delete headers.cookie; // the app signs in with a bearer token, never the website's cookie
    delete headers.origin;
    const upstream = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    upstream.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Can't reach the NepalShop dev server at ${target.origin}` }));
    });
    req.pipe(upstream);
  },
};

module.exports = config;
