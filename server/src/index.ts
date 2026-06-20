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
import { cardsRoute } from "./routes/cards.js";
import { uploadsRoute } from "./routes/uploads.js";

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
 * Normalize an inbound Google Chat request for the adapter, which expects the
 * event at the top level and reads the OIDC token only from the Authorization
 * header. Workspace ADD-ON deliveries differ in two ways:
 *   - the event may be wrapped as `{ payload: {...} }`
 *   - interaction events may carry the token in the body
 *     (authorizationEventObject.systemIdToken) instead of the header
 * We unwrap the envelope and, when the header is absent, lift the body token
 * into `Authorization: Bearer …`. No-op for already-flat, header-bearing
 * MESSAGE events, so the working path is untouched.
 */
async function normalizeGchatRequest(
  raw: Request,
): Promise<{ request: Request; event: GChatEvent | null }> {
  const bodyText = await raw.clone().text();
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") {
    return { request: raw, event: null };
  }

  const obj = parsed as Record<string, unknown>;
  const wrapped =
    obj.payload && typeof obj.payload === "object" && !obj.chat && !obj.commonEventObject;
  const inner = (wrapped ? obj.payload : obj) as Record<string, unknown>;

  const headers = new Headers(raw.headers);
  const hadAuth = headers.has("authorization");
  const systemIdToken = (inner.authorizationEventObject as { systemIdToken?: unknown } | undefined)
    ?.systemIdToken;
  const injectedToken = !hadAuth && typeof systemIdToken === "string";
  if (injectedToken) headers.set("authorization", `Bearer ${systemIdToken as string}`);

  if (!wrapped && !injectedToken) {
    return { request: raw, event: inner as GChatEvent };
  }

  headers.delete("content-length"); // body length may have changed after unwrap
  const request = new Request(raw.url, {
    method: raw.method,
    headers,
    body: JSON.stringify(inner),
  });
  return { request, event: inner as GChatEvent };
}

/**
 * Inbound Google Chat webhook. The adapter verifies the Google-signed JWT before
 * the SDK routes the event. We peek the body to handle two lifecycle events the
 * SDK does not act on itself (§6.4) — it only logs removals and our record store
 * is separate from SDK state:
 *   - ADDED_TO_SPACE     → capture the recipient (welcomed=0 so the first
 *                          message still gets a welcome card)
 *   - REMOVED_FROM_SPACE → delete the stored record
 * then forward the normalized request to the SDK so it can ack/process the event.
 */
app.post("/api/webhooks/gchat", async (c) => {
  const { request, event } = await normalizeGchatRequest(c.req.raw);

  const chat = event?.chat;
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
  return bot.webhooks.gchat(request, { waitUntil: (p) => p });
});

// Application API (§6.2 / §6.3 / §6.6).
app.route("/api", recipientsRoute);
app.route("/api", sendRoute);
app.route("/api", incomingRoute);
app.route("/api", cardsRoute);
app.route("/api", uploadsRoute);

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
  console.log(`  cards:      GET  /api/cards · POST /api/cards/update · GET /api/card-presets`);
  console.log(`  uploads:    POST /api/uploads · GET /api/uploads/:id`);
  console.log(`  feed (SSE): GET  /api/incoming`);
  if (!config.publicBaseUrl) {
    console.log(
      "  note:       PUBLIC_BASE_URL unset — uploaded card images render in the " +
        "builder preview but NOT in Chat (Google can't reach localhost).",
    );
  }
});
