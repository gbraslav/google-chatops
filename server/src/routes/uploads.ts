/**
 * Image upload routes (for the card builder's image widget).
 *
 *   POST /api/uploads        multipart `file` → stores it, returns a public URL
 *   GET  /api/uploads/:id    serves a stored image (this is what Google fetches)
 *
 * Google renders card images by fetching the imageUrl server-side, so the URL we
 * return must be publicly reachable. We build it from config.publicBaseUrl (set
 * this to a tunnel pointing at this server) and fall back to the request origin
 * (localhost) — which only renders in the local builder preview, not in Chat.
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { config } from "../config.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

mkdirSync(config.uploadDir, { recursive: true });

export const uploadsRoute = new Hono();

uploadsRoute.post("/uploads", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "Expected a multipart 'file' field." }, 400);
  }
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return c.json({ error: `Unsupported image type: ${file.type || "unknown"}` }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large (max 5 MB)." }, 400);
  }

  const id = `${randomUUID()}.${ext}`;
  await writeFile(join(config.uploadDir, id), Buffer.from(await file.arrayBuffer()));

  const base = (config.publicBaseUrl ?? new URL(c.req.url).origin).replace(/\/$/, "");
  return c.json({
    ok: true,
    id,
    url: `${base}/api/uploads/${id}`,
    // false → URL is localhost-based; renders in the builder preview but not in Chat.
    public: Boolean(config.publicBaseUrl),
  });
});

uploadsRoute.get("/uploads/:id", async (c) => {
  const id = c.req.param("id");
  // Generated ids only — blocks path traversal.
  if (!/^[A-Za-z0-9-]+\.[A-Za-z0-9]+$/.test(id)) {
    return c.json({ error: "Invalid id." }, 400);
  }
  const path = join(config.uploadDir, id);
  if (!existsSync(path)) {
    return c.json({ error: "Not found." }, 404);
  }
  const mime = EXT_TO_MIME[extname(id).slice(1).toLowerCase()] ?? "application/octet-stream";
  const data = await readFile(path);
  return c.body(new Uint8Array(data), 200, {
    "Content-Type": mime,
    "Cache-Control": "public, max-age=86400",
  });
});
