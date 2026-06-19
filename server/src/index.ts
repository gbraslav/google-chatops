/**
 * Server bootstrap (requirements §6.7).
 *
 * Hono app (Fetch-native, pairs directly with the Chat SDK's webhook handlers):
 *   - POST /api/webhooks/gchat  inbound Google Chat events (JWT verified by adapter)
 *   - GET  /api/recipients      recipient list
 *   - POST /api/send            proactive send
 *   - GET  /api/incoming        SSE live feed
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

import { config } from "./config.js";
import { bot } from "./bot.js";
import { store } from "./store/index.js";
import type { GChatEvent } from "./gchatEvents.js";
import { recipientsRoute } from "./routes/recipients.js";
import { sendRoute } from "./routes/send.js";
import { incomingRoute } from "./routes/incoming.js";

const app = new Hono();

// §6.7: CORS restricted to the web origin; GET/POST/OPTIONS.
app.use(
  "/api/*",
  cors({
    origin: config.webOrigin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Inbound Google Chat webhook. The adapter verifies the Google-signed JWT before
 * the SDK routes the event. We peek the body to handle two lifecycle events the
 * SDK does not act on itself (§6.4) — it only logs removals and our record store
 * is separate from SDK state:
 *   - ADDED_TO_SPACE     → capture the recipient (welcomed=0 so the first
 *                          message still gets a welcome card)
 *   - REMOVED_FROM_SPACE → delete the stored record
 * then forward the original request to the SDK so it can ack/process the message.
 */
app.post("/api/webhooks/gchat", async (c) => {
  // Clone so reading the body here does not consume the stream the SDK needs.
  const peeked = (await c.req.raw
    .clone()
    .json()
    .catch(() => null)) as GChatEvent | null;

  const chat = peeked?.chat;
  const removedSpace = chat?.removedFromSpacePayload?.space?.name;
  const addedSpace = chat?.addedToSpacePayload?.space?.name;

  if (removedSpace) {
    store.delete(removedSpace);
  } else if (addedSpace) {
    store.upsert({
      key: addedSpace,
      spaceName: addedSpace,
      senderId: chat?.user?.name ?? "",
      threadId: "",
      displayName: chat?.user?.displayName ?? "",
      email: chat?.user?.email ?? null,
      welcomed: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  if (!bot) {
    // Degraded mode (no credentials): we still captured lifecycle events above.
    return c.json({ error: "Chat app is not configured (missing credentials)." }, 503);
  }
  return bot.webhooks.gchat(c.req.raw, { waitUntil: (p) => p });
});

// Application API (§6.2 / §6.3 / §6.6).
app.route("/api", recipientsRoute);
app.route("/api", sendRoute);
app.route("/api", incomingRoute);

// §6.7: warn on startup if app credentials are missing.
if (!config.credentialsConfigured) {
  console.warn(
    "⚠️  Google Chat app credentials are not configured. " +
      "Inbound events may work, but POST /api/send will return 502 until you set " +
      "GOOGLE_CHAT_CREDENTIALS or enable ADC.",
  );
}
if (config.allowInsecureEvents) {
  console.warn(
    "⚠️  ALLOW_INSECURE_EVENTS is on — inbound webhook JWT verification is DISABLED. " +
      "Use only for local testing.",
  );
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`);
  console.log(`  webhook:    POST /api/webhooks/gchat`);
  console.log(`  recipients: GET  /api/recipients`);
  console.log(`  send:       POST /api/send`);
  console.log(`  feed (SSE): GET  /api/incoming`);
});
