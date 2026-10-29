import { Hono } from "hono";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ApiError, storeOwner, type ApiEnv } from "../middleware";
import { subscribe } from "~/server/realtime";

/**
 * Live dashboard updates (new messages, orders, payments) as Server-Sent Events.
 * SSE is a plain streaming response, so it works through Vite in dev and any proxy in production.
 * The mobile app can use it while open; push notifications cover it in the background.
 */
export const events = new Hono<ApiEnv>().use(storeOwner).get("/", (c) => {
  const storeId = c.get("storeId");
  const signal = c.req.raw.signal;
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      write("retry: 3000\n\n");
      const unsubscribe = subscribe(storeId, (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const ping = setInterval(() => write(": ping\n\n"), 25_000); // keeps proxies and idle timeouts from closing it
      cleanup = () => {
        unsubscribe();
        clearInterval(ping);
      };
      signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX = 5 * 1024 * 1024;

/** Product photos and logos: multipart form with one `file`. Returns its public URL. */
export const uploads = new Hono<ApiEnv>().use(storeOwner).post("/", async (c) => {
  // Hono's parseBody rather than raw formData(): same result, and its types also check in the mobile app's project.
  const file = (await c.req.parseBody().catch(() => null))?.file;
  if (!(file instanceof Blob)) throw new ApiError(400, "Choose an image to upload");
  const ext = TYPES[file.type];
  if (!ext) throw new ApiError(400, "Images must be JPG, PNG, WEBP or GIF");
  if (file.size > MAX) throw new ApiError(400, "Images must be under 5 MB");
  const name = `${c.get("storeId")}-${crypto.randomUUID()}.${ext}`;

  // With S3_BUCKET set, Bun's built-in S3 client stores it (S3, R2, Spaces, MinIO).
  if (process.env.S3_BUCKET) {
    await Bun.s3.file(name, { bucket: process.env.S3_BUCKET }).write(file, { type: file.type });
    return c.json({ url: `${process.env.S3_PUBLIC_URL?.replace(/\/$/, "")}/${name}` }, 201);
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await Bun.write(path.join(UPLOAD_DIR, name), file);
  return c.json({ url: `/uploads/${name}` }, 201);
});
