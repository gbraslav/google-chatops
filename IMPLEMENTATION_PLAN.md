# Google Chat Proactive Messenger — Implementation Plan

Implementation plan for the requirements in
[`google-chat-cards-requirements.md`](./google-chat-cards-requirements.md),
built on the **open-source Vercel Chat SDK** (`chat`) with its
**Google Chat adapter** (`@chat-adapter/gchat`).

> **Why the Chat SDK instead of raw Google packages?** `@chat-adapter/gchat`
> wraps `@googleapis/chat` and the Workspace Events API and gives us, for free,
> the parts of §6/§7/§8/§12 that are tedious to hand-roll:
> - **Inbound JWT verification** (§6.1/§12) via `googleChatProjectNumber` —
>   fail-closed by default.
> - **Event normalization** — `ADDED_TO_SPACE`/`MESSAGE`/`REMOVED_FROM_SPACE`
>   become unified handlers (`onDirectMessage`, etc.).
> - **Proactive send** (§6.3) via `bot.openDM("users/…").post(...)` —
>   no manual `spaces.messages.create`.
> - **Cards** (§8) via one JSX/`Card()` API that renders to Google Chat
>   `cardsV2`.
> - **Dedupe + locking** (§6.8 robustness) via a state adapter.
>
> We still own the bits the SDK does **not** cover: the recipient registry the
> web app reads, and the SSE live feed. Those stay in our own server.

---

## 1. Tech stack & package choices

Versions below are the latest stable as of this plan (June 2026).

### Server (`server/`)

| Package | Version | Role |
|---|---|---|
| `chat` | `^4.30.0` | **Vercel Chat SDK core** — `Chat` instance, event routing, `openDM()`, cards, webhook handlers. |
| `@chat-adapter/gchat` | `^4.30.0` | **Google Chat adapter** — wraps `@googleapis/chat`, verifies inbound JWTs, normalizes events, sends proactively, renders cards to `cardsV2`. |
| `@chat-adapter/state-memory` | `^4.30.0` | SDK state (subscriptions, locks, dedupe) for local dev. Swap for `@chat-adapter/state-pg` (`^4.30.0`) in production. |
| `hono` | `^4.12.23` | HTTP server. Chat SDK webhook handlers are Fetch-native `(Request) ⇒ Response`, so Hono is a direct fit (also gives us CORS + SSE). |
| `@hono/node-server` | `^2.0.4` | Run Hono on Node. |
| `better-sqlite3` | `^12.10.0` | Our own recipient registry (the data the web app lists / sends to). File-based, git-ignored. |
| `zod` | `^4.4.3` | Validate `/api/send` bodies (whitelist, reject unknown fields). |
| `typescript` | `^6.0.3` | Types. |
| `tsx` | `^4.22.4` | Dev runner / watch (no build step in dev). |

> **`@googleapis/chat` comes transitively** through `@chat-adapter/gchat` — we
> don't depend on it directly. We never touch `spaces.messages.create` or
> `verifyIdToken` ourselves.
>
> **Why Hono over Express:** the SDK exposes `bot.webhooks.gchat` as a
> Web-standard Fetch handler (the same shape used as a Next.js route export).
> Hono passes `c.req.raw` straight in. Express 5 would need a Request/Response
> bridge.

### Web (`web/`)

| Package | Version | Role |
|---|---|---|
| `react` / `react-dom` | `^19.2.7` | Composer SPA. |
| `vite` | `^8.0.16` | Dev server + build; `VITE_API_BASE` wiring. |
| `typescript` | `^6.0.3` | Types. |

The web client is **unchanged** by the SDK decision — it only talks to our HTTP
API (`/api/recipients`, `/api/send`, `/api/incoming`).

---

## 2. Architecture (with the Chat SDK)

```
┌────────────┐  POST /api/send   ┌─────────────────────────────┐   Chat SDK    ┌──────────┐
│  Web UI    │ ────────────────▶ │   Server (Hono)             │  openDM().post │ Google   │
│ (composer) │                   │                             │ ─────────────▶ │ Chat     │
│            │ ◀─ SSE /incoming ─│  ┌────────────────────────┐ │                │          │
└────────────┘                   │  │ Chat SDK (`chat`)      │ │ ◀── webhook ── │          │
                                 │  │ + @chat-adapter/gchat  │ │  /api/webhooks │          │
   our code ─────────────────────┼─▶│  onDirectMessage()     │ │     /gchat     └──────────┘
   • recipient registry (SQLite) │  │  cards (JSX)           │ │  (JWT verified
   • feed bus + SSE              │  │  state (memory/pg)     │ │   by adapter)
   • /api/recipients /send       │  └────────────────────────┘ │
                                 └─────────────────────────────┘
```

- **Inbound:** Google Chat → `POST /api/webhooks/gchat` → adapter verifies the
  Google JWT → SDK routes to `bot.onDirectMessage(thread, message)`. Our handler
  upserts the recipient record, publishes to the feed bus, and replies with the
  echo card (welcome card on first contact).
- **Outbound:** web → `POST /api/send` → look up the stored `users/…` id →
  `bot.openDM(userId).post(text)`.

> **DM scope note:** the demo is 1:1 DMs. With **"Receive 1:1 messages"**
> enabled in the Chat config, Google delivers every DM to the app's HTTP
> endpoint directly — so we do **not** need Workspace Events / Pub/Sub. (The
> adapter supports `pubsubTopic`/`impersonateUser` for receiving *all* messages
> in multi-user spaces; that's out of scope here, §1 of requirements.)

---

## 3. Mapping requirements → Chat SDK

| Requirement | Chat SDK mechanism |
|---|---|
| §6.1 verify Google JWT | `createGoogleChatAdapter({ googleChatProjectNumber })` — verifies `aud = project number`, fail-closed. No `/api/events` of our own. |
| §6.1 webhook endpoint | `bot.webhooks.gchat` mounted at `POST /api/webhooks/gchat`. |
| `ADDED_TO_SPACE` / first `MESSAGE` → welcome card | `onDirectMessage`: if no stored record for the space, send **welcome card**, else **echo card**. (Requirements §6.4 explicitly allow capturing on message, covering a missed add.) |
| `MESSAGE` → capture + feed + echo | `onDirectMessage`: upsert record, publish to feed bus, reply echo card. |
| `REMOVED_FROM_SPACE` → delete record | Adapter normalizes removal; we delete on the removal signal (see §4.3). |
| §6.3 proactive send | `bot.openDM(record.senderId).post(text)` (or `bot.thread(record.threadId).post(...)`). |
| §8 cards | `Card`/`CardText`/`Section`/`Fields`/`LinkButton` → `cardsV2`. |
| §6.5 identity | `message.author` (`displayName`, `email` when directory scope granted; tolerate absence). |
| §6.8 robustness | SDK locking/dedupe + try/catch fallback in the handler. |

---

## 4. Repository layout

```
google-chatops/
├── google-chat-cards-requirements.md
├── IMPLEMENTATION_PLAN.md          # this file
├── .gitignore                      # node_modules, **/.env, data/*.db, *credentials*.json
├── server/
│   ├── package.json
│   ├── tsconfig.json               # jsx: react-jsx, jsxImportSource: "chat"
│   ├── .env.example
│   └── src/
│       ├── index.ts                # Hono app: CORS, routes, listen; startup checks
│       ├── config.ts               # env parsing + "credentials configured?" flag
│       ├── bot.ts                  # Chat instance + gchat adapter + handlers (registerSingleton)
│       ├── cards/
│       │   ├── welcomeCard.tsx     # §8.1 pure builder → Card(...)
│       │   └── echoCard.tsx        # §8.2 pure builder → Card(...)
│       ├── routes/
│       │   ├── recipients.ts       # GET /api/recipients
│       │   ├── send.ts             # POST /api/send  (uses bot.openDM)
│       │   └── incoming.ts         # GET /api/incoming (SSE)
│       ├── feed/
│       │   └── bus.ts              # in-process EventEmitter pub/sub for SSE
│       └── store/
│           ├── types.ts            # SpaceRecord + Store interface
│           └── sqliteStore.ts      # better-sqlite3 implementation (swappable)
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api.ts                  # fetch wrappers + EventSource
        ├── components/
        │   ├── RecipientPicker.tsx # §5.1
        │   ├── Composer.tsx        # §5.2 / §5.3
        │   └── IncomingFeed.tsx    # §5.4
        └── styles.css
```

---

## 5. Data model & store (§9)

The Chat SDK's **state adapter** handles subscriptions/locks/dedupe — that is
*not* a queryable recipient directory. So we keep our **own** registry (the data
`GET /api/recipients` lists and `POST /api/send` looks up):

```ts
interface SpaceRecord {
  key: string;          // = spaceName, primary key (the recipient key)
  spaceName: string;    // "spaces/AAAA..."
  senderId: string;     // "users/12345"  ← used by bot.openDM() for proactive send
  threadId: string;     // SDK thread id (alt send path: bot.thread(threadId))
  displayName: string;
  email: string | null;
  updatedAt: string;    // ISO 8601
}

interface Store {
  upsert(rec: SpaceRecord): void;
  delete(key: string): void;
  get(key: string): SpaceRecord | undefined;
  list(): SpaceRecord[];   // /api/recipients sorts by displayName (case-insensitive)
}
```

`sqliteStore.ts`: single `spaces` table, `key PRIMARY KEY`, upsert via
`INSERT … ON CONFLICT(key) DO UPDATE`. Stored in `data/spaces.db` (git-ignored,
PII, resettable by deleting the file).

---

## 6. Server implementation

### 6.1 The bot — `bot.ts`

```ts
import { Chat } from "chat";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { store } from "./store/sqliteStore";
import { bus } from "./feed/bus";
import { welcomeCard } from "./cards/welcomeCard";
import { echoCard } from "./cards/echoCard";

export const bot = new Chat({
  userName: "ChatOps",
  adapters: {
    gchat: createGoogleChatAdapter({
      // GOOGLE_CHAT_CREDENTIALS (service-account JSON) auto-detected from env.
      // googleChatProjectNumber → verifies inbound JWT audience (§6.1/§12).
      googleChatProjectNumber: process.env.GOOGLE_CHAT_PROJECT_NUMBER,
      endpointUrl: process.env.GCHAT_ENDPOINT_URL, // for button-click routing
    }),
  },
  state: createMemoryState(),       // swap createPostgresState() in prod
  dedupeTtlMs: 600_000,
}).registerSingleton();

bot.onDirectMessage(async (thread, message) => {
  try {
    const spaceName = (thread.id);                 // durable handle (encodes space)
    const known = store.get(spaceName);
    const name = message.author?.displayName;

    // §6.4 upsert on every message (covers a missed ADDED_TO_SPACE)
    store.upsert({
      key: spaceName,
      spaceName,
      senderId: message.author?.id ?? "",
      threadId: thread.id,
      displayName: name ?? "",
      email: message.author?.email ?? null,        // §6.5 tolerate absence
      updatedAt: new Date().toISOString(),
    });

    // §6.6 publish to the live feed
    bus.emit("incoming", {
      displayName: name, spaceName, senderId: message.author?.id,
      email: message.author?.email ?? null,
      text: message.text, receivedAt: new Date().toISOString(),
    });

    // §8 first contact → welcome card; otherwise echo card
    await thread.post(known ? echoCard(name, message.text) : welcomeCard(name));
  } catch (err) {
    // §6.8 friendly fallback into the space
    await thread.post("Sorry — something went wrong handling that message.");
    console.error("onDirectMessage failed:", err);
  }
});
```

Notes:
- The adapter verifies the inbound JWT **before** our handler runs; an
  unverified request never reaches `onDirectMessage` (returns 401 from the
  webhook). That satisfies §6.1/§12 without a hand-rolled middleware.
- We persist both `senderId` (for `openDM`) and `threadId` (alt send path).

### 6.2 Removal handling (§6.4) — `REMOVED_FROM_SPACE`

The SDK normalizes lifecycle events; there is no dedicated "removed" handler in
the public surface, so handle it at the adapter/webhook boundary:
- Inspect the raw Google event in a thin pre-router (the webhook still goes
  through `bot.webhooks.gchat`); when the raw `type === "REMOVED_FROM_SPACE"`,
  `store.delete(spaceName)` and short-circuit.
- Concretely: wrap `bot.webhooks.gchat` in our route handler, peek at the parsed
  body for `REMOVED_FROM_SPACE`, delete the record, then still pass the request
  to the SDK so it can ack. (Verify the exact raw shape against
  `node_modules/@chat-adapter/gchat/dist/index.d.ts` —
  `WorkspaceEventNotification` / reaction/space payloads are typed there.)

### 6.3 Cards — `cards/*.tsx` (§8)

Pure builders returning `Card(...)` (function syntax — robust types, no JSX
ambiguity), rendering to Google Chat `cardsV2` via the adapter:

```tsx
import { Card, CardText, Section, Fields, Field, Actions, LinkButton } from "chat";

export const welcomeCard = (name?: string) =>
  Card({
    title: name ? `Hi ${name} — welcome to ChatOps` : "Welcome to ChatOps",
    subtitle: "Proactive messages demo",
    children: [
      CardText("This app bridges a companion web app into Google Chat. " +
               "You're now registered as a recipient."),
      Section({ children: [
        Fields({ children: [
          Field({ label: "1", value: "Open the web app" }),
          Field({ label: "2", value: "Type a message and send" }),
          Field({ label: "3", value: "It appears here as a proactive Chat message" }),
        ]}),
      ]}),
      CardText("_Tip: send any message here to confirm the app has your space reference._"),
    ],
  });

export const echoCard = (name: string | undefined, received: string) =>
  Card({
    title: name ? `Thanks, ${name}` : "Thanks",
    children: [
      CardText("You're registered as a recipient. Here's what I received:"),
      Section({ children: [ CardText({ style: "bold", children: received }) ] }), // emphasis block
      CardText("_Try sending from the web app to see a proactive message land here._"),
      Actions({ children: [
        LinkButton({ url: process.env.WEB_APP_URL!, children: "Open web app" }),
      ]}),
    ],
  });
```

Both are trivially unit-testable (call → assert on the returned object).

### 6.4 HTTP server — `index.ts` (Hono)

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { bot } from "./bot";
import { config } from "./config";

const app = new Hono();
app.use("/api/*", cors({ origin: config.webOrigin, allowMethods: ["GET","POST","OPTIONS"] }));

// Inbound Google Chat webhook (JWT verified by the adapter)
app.post("/api/webhooks/gchat", async (c) => {
  const body = await c.req.json();
  if (body?.type === "REMOVED_FROM_SPACE") {        // §6.2 above
    store.delete(body.space?.name);
  }
  return bot.webhooks.gchat(c.req.raw, { waitUntil: (p) => p });
});

app.route("/api", recipientsRoute);  // GET /api/recipients
app.route("/api", sendRoute);        // POST /api/send
app.route("/api", incomingRoute);    // GET /api/incoming (SSE)

if (!config.credentialsConfigured) console.warn("⚠️  Google Chat credentials not configured");
serve({ fetch: app.fetch, port: config.port }); // default 3978
```

> Re-reading the JSON body before handing the raw `Request` to the SDK consumes
> the stream — clone first (`c.req.raw.clone()`) or reconstruct a `Request` from
> the parsed body when forwarding. Confirm against the adapter's expected input.

### 6.5 `GET /api/recipients` (§6.2) — `routes/recipients.ts`
`store.list()` → `[{ key, displayName, email?, identifier? }]`, sorted by
`displayName` case-insensitive. No auth in the demo (document: protect in prod).

### 6.6 `POST /api/send` (§6.3) — `routes/send.ts`
- zod validate: `recipientKey` non-empty, `text` length 1..4000 → else `400`.
- `store.get(recipientKey)` missing → `404`.
- `config.credentialsConfigured` false → `502` ("app credentials not configured").
- Send: `const dm = await bot.openDM(record.senderId); await dm.post(text);`
  - on upstream error → `502` with detail; surface Chat `429` quota errors.
- success → `{ ok: true, deliveredAt: <ISO>, recipientKey }`.

### 6.7 `GET /api/incoming` (§6.6) — `routes/incoming.ts`
Hono SSE (`streamSSE` from `hono/streaming`): subscribe to `bus`, emit each
incoming message as an SSE `data:` line, keep-alive pings, unsubscribe on abort.
Payload: `{ displayName, spaceName, senderId, email?, identifier?, text, receivedAt }`.

### 6.8 `feed/bus.ts` (§6.6)
Module-level `EventEmitter` ("incoming" channel). Handler publishes; SSE route
subscribes.

### 6.9 `config.ts` / bootstrap (§6.7)
Parse env; `credentialsConfigured` = `GOOGLE_CHAT_CREDENTIALS` or
`GOOGLE_CHAT_USE_ADC` present. CORS origin from `WEB_ORIGIN`. Port from `PORT`
(default `3978`). Warn on startup if credentials missing.

### 6.10 `tsconfig.json` (cards)
```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "chat",
  "module": "nodenext", "moduleResolution": "nodenext", "target": "es2022", "strict": true } }
```
(Required only if you use JSX card syntax; the `Card(...)` function syntax above
works without it.)

---

## 7. Web client implementation (§5)

Unchanged by the SDK choice — talks only to our HTTP API.

- **`api.ts`**: base URL from `import.meta.env.VITE_API_BASE` (default same-origin).
  `getRecipients()`, `send(recipientKey, text)`, `openIncoming(onMessage)` → `EventSource`.
- **`RecipientPicker.tsx`** (§5.1): fetch on mount + **Refresh** with loading
  state; label `"<displayName> — <email>"` (fallback to name); preserve selection
  across refresh; default to first; empty-state guidance; inline fetch error.
- **`Composer.tsx`** (§5.2/§5.3): multiline textarea; counter with **4000** max
  (error style when exceeded); **Send** enabled only when not sending + recipient
  selected + trimmed non-empty & within limit; status `idle→sending→success/error`;
  success shows server timestamp + clears input; error messages keyed off HTTP
  status (404/502/400/other).
- **`IncomingFeed.tsx`** (§5.4): `EventSource` to `/api/incoming`; connection
  indicator (**live**/**connecting…**); prepend, cap **50**; each item shows name,
  received time, email/identifier when present, text; empty-state text.
- Cosmetic animation (§5.6) optional.

---

## 8. Environment configuration (§10)

`server/.env.example`:
```bash
# --- Chat SDK / Google Chat adapter ---
# Service-account JSON (whole file contents, single line) — app identity for sends
GOOGLE_CHAT_CREDENTIALS={"type":"service_account", ... }
# OR use ADC instead of the line above:
# GOOGLE_CHAT_USE_ADC=true

# Inbound JWT audience = your Cloud project NUMBER (adapter verifies aud == this)
GOOGLE_CHAT_PROJECT_NUMBER=1234567890

# Public HTTPS URL of the webhook (for button-click routing)
GCHAT_ENDPOINT_URL=https://<tunnel-host>/api/webhooks/gchat

# --- our server ---
WEB_ORIGIN=http://localhost:5173
PORT=3978
WEB_APP_URL=http://localhost:5173      # echo card "Open web app" button
```

`web/.env.example`:
```bash
VITE_API_BASE=http://localhost:3978
```

`.gitignore`: `node_modules/`, `**/.env`, `server/data/*.db`, `*credentials*.json`.

---

## 9. Google Cloud / Chat app setup (§7, §11)

Mirrors the adapter's documented setup. Replace `<…>`.

1. **Create / select a GCP project.** Note the **project number** →
   `GOOGLE_CHAT_PROJECT_NUMBER`
   (`gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'`).
2. **Enable the Google Chat API:**
   `gcloud services enable chat.googleapis.com --project <PROJECT_ID>`
   (Workspace Events + Pub/Sub APIs are only needed for multi-user "all
   messages" delivery — **not** for this 1:1 DM demo.)
3. **Create a service account + JSON key** (app identity for sends):
   ```bash
   gcloud iam service-accounts create chatops-app \
     --display-name="ChatOps App" --project <PROJECT_ID>
   gcloud iam service-accounts keys create credentials.json \
     --iam-account=chatops-app@<PROJECT_ID>.iam.gserviceaccount.com
   ```
   Put the JSON contents into `GOOGLE_CHAT_CREDENTIALS` (or use ADC via
   `gcloud auth application-default login` + `GOOGLE_CHAT_USE_ADC=true`).
4. **Start a public HTTPS tunnel** to the server (§10) and copy the HTTPS URL.
5. **Configure the Chat app** (console → *Google Chat API → Configuration*):
   - **App name**, **Avatar URL**, **Description** (short + long).
   - **Interactive features:** enable **Receive 1:1 messages**.
   - **Connection settings:** **App URL** =
     `https://<tunnel-host>/api/webhooks/gchat`.
   - **Authentication Audience:** **Project Number** (matches
     `GOOGLE_CHAT_PROJECT_NUMBER`).
   - **Visibility:** make available to your test users.

> The tunnel URL rotates per restart — update **App URL** (and
> `GCHAT_ENDPOINT_URL`) when it changes, or use a persistent tunnel.

---

## 10. Installation & run

### Prerequisites
- Node.js ≥ 20 LTS, npm (the adapter README uses pnpm; npm works the same).
- A tunnel — **cloudflared** (`cloudflared tunnel --url http://localhost:3978`)
  or **ngrok** (`ngrok http 3978`).
- Completed Cloud setup (§9).

### Install
```bash
cd server && npm install   # chat @chat-adapter/gchat @chat-adapter/state-memory hono @hono/node-server better-sqlite3 zod tsx typescript
cd ../web && npm install    # react react-dom vite typescript
```

`server/package.json` scripts:
```json
{ "scripts": {
  "dev": "tsx watch src/index.ts",
  "start": "tsx src/index.ts",
  "typecheck": "tsc --noEmit",
  "test": "node --test"
} }
```
`web/package.json`: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`.

### Run (4 terminals)
```bash
# 1) server
cd server && cp .env.example .env   # then edit values
npm run dev                          # http://localhost:3978

# 2) tunnel  → put the https URL into Chat config App URL + GCHAT_ENDPOINT_URL (§9.5)
cloudflared tunnel --url http://localhost:3978

# 3) web
cd web && cp .env.example .env
npm run dev                          # http://localhost:5173
```

---

## 11. Testing instructions

### 11.1 Unit tests (no cloud)
- **Card builders** (`cards/*.tsx`): assert greeting variants (name vs none),
  the 3 "how it works" rows in the welcome card, the emphasis block + received
  text in the echo card, and the `LinkButton` url == `WEB_APP_URL`.
- **Store**: upsert → get → list ordering → delete round-trip on a temp DB.
- **Validation**: zod rejects empty `recipientKey`, `text` length 0 and 4001,
  and unknown fields.
Run: `cd server && npm test`.

### 11.2 Local API smoke tests
The Google webhook is JWT-protected by the adapter, so test the inbound path
**through a real tunnel** (§11.3). The non-webhook endpoints test directly:
```bash
# recipients (empty until someone DMs the app)
curl -s http://localhost:3978/api/recipients | jq

# SSE feed (separate terminal; should stay open)
curl -N http://localhost:3978/api/incoming

# send error paths
curl -sX POST http://localhost:3978/api/send -H 'Content-Type: application/json' \
  -d '{"recipientKey":"spaces/NOPE","text":"hi"}' -w '\n%{http_code}\n'   # 404
curl -sX POST http://localhost:3978/api/send -H 'Content-Type: application/json' \
  -d '{"recipientKey":"spaces/X","text":""}' -w '\n%{http_code}\n'        # 400
```
For an offline inbound test you may set the adapter's
`disableSignatureVerification: true` **in a dev-only profile** to POST a synthetic
Google event to `/api/webhooks/gchat`; never enable it in a shared/deployed env.

### 11.3 End-to-end (real round-trip, §11.6–7)
1. In **Google Chat**, find the app and **DM it** ("hi").
   → A **welcome card** appears (first contact), then **echo cards** on later
   messages.
   → `GET /api/recipients` now lists you; the web dropdown shows you.
   → The web app's **live feed** shows your "hi".
2. In the **web app**, select yourself, type, click **Send**.
   → Message arrives in the Chat DM **from the app** (proactive via `openDM`).
   → UI shows delivered confirmation + timestamp.
3. Send more DMs → confirm streaming into the feed (cap 50).
4. Remove the app from the DM → `REMOVED_FROM_SPACE` deletes the record;
   recipient disappears from `/api/recipients`.

### 11.4 Auth verification check
POST to `/api/webhooks/gchat` **without** a valid bearer token (signature
verification enabled) → expect **401** from the adapter. A genuine
tunnel-delivered event passes (`aud == GOOGLE_CHAT_PROJECT_NUMBER`,
`iss == chat@system.gserviceaccount.com`).

---

## 12. Build order

1. Scaffold `server/` + `web/`; install deps; `.gitignore`; `.env.example`.
2. Store (`sqliteStore.ts`) + types + unit tests.
3. Card builders + unit tests.
4. `bot.ts` (adapter + `onDirectMessage`) with `disableSignatureVerification` in
   a dev profile → synthetic-event smoke test.
5. Feed bus + SSE route → verify streaming.
6. `/api/send` (`bot.openDM`) + `/api/recipients` → error-path tests.
7. Cloud setup (§9) + tunnel → full E2E (§11.3) with verification ON.
8. Removal handling (§6.2) — confirm against the adapter's typed payloads.
9. Tighten: remove dev bypass; confirm CORS/PORT/startup warnings; swap to
   `@chat-adapter/state-pg` if you want persistence across restarts.

---

## 13. Requirements traceability

| Requirement | Where |
|---|---|
| §5 Web client | `web/src/**` (§7) |
| §6.1 events + JWT | adapter (`googleChatProjectNumber`) + `bot.webhooks.gchat` |
| §6.2 recipients | `routes/recipients.ts` |
| §6.3 send | `routes/send.ts` → `bot.openDM().post()` |
| §6.4 capture rules | `bot.onDirectMessage` + removal peek + `store/` |
| §6.5 identity | `message.author` in `bot.ts` |
| §6.6 live feed | `feed/bus.ts` + `routes/incoming.ts` (SSE) |
| §6.7 CORS/bootstrap | `index.ts` + `config.ts` |
| §6.8 error handling | try/catch in `onDirectMessage` + SDK locking/dedupe |
| §8 cards | `cards/welcomeCard.tsx`, `cards/echoCard.tsx` |
| §9 data model | `store/types.ts` + `sqliteStore.ts` |
| §10 config | `.env.example` files |
| §7/§11/§12 setup & security | §9–§11 |

---

## 14. Notes & deferred items (match requirements' out-of-scope)
- `/api/send` & `/api/recipients` are **unauthenticated** in the demo — add
  identity-protected auth before any real deployment.
- `disableSignatureVerification` is **dev-only**; off in any shared/deployed env.
- Tunnel URL rotates per restart — update **App URL** + `GCHAT_ENDPOINT_URL`, or
  use a persistent tunnel.
- `state-memory` doesn't survive restarts (subscriptions/dedupe) — fine for
  single-box dev; use `@chat-adapter/state-pg` in production. Our SQLite recipient
  registry persists regardless.
- Surface Chat `429` quota errors to the UI (per-app send limits).
- Multi-user spaces ("receive all messages") would need the adapter's
  `pubsubTopic` + Workspace Events + Pub/Sub — out of scope for this 1:1 demo.

---

## 15. Implementation notes (verified against the built code)

Discovered while building and smoke-testing; the shipped code reflects these:

- **Event format is the Google Chat "add-ons" envelope**, not `{ type, message }`.
  Inbound bodies are `event.chat.{messagePayload,addedToSpacePayload,removedFromSpacePayload,buttonClickedPayload}`.
  Typed in `server/src/gchatEvents.ts`; used by `bot.ts` and the webhook peek.
- **`message.raw` is the whole event**, so space name + sender email are read from
  `event.chat.messagePayload.*` (display name + user id are normalized onto
  `message.author`).
- **The SDK only logs `REMOVED_FROM_SPACE`** (no delete) — our webhook peek does the
  `store.delete`, and also captures `ADDED_TO_SPACE` (welcomed=0 so the first
  message still gets a welcome card).
- **`disableSignatureVerification` only applies when `googleChatProjectNumber` is
  unset.** With the project number set, JWTs are always verified. So the dev
  bypass (`ALLOW_INSECURE_EVENTS`) is used with the project number unset.
- **Degraded mode:** the gchat adapter constructor *requires* credentials, so
  `bot` is `null` when none are configured — the server still boots and warns,
  `/api/send` returns `502`, and the webhook returns `503` (still capturing
  lifecycle events).
- **Cards use the function-call API** (`Card({title, children:[...]})`,
  `CardText(text, {style})`, `Section([...])`, `Fields([...])`, `LinkButton({url,label})`)
  in `.ts` files — no JSX config needed.
- **Server is ESM + `moduleResolution: Bundler`**, run via `tsx`. Latest stable
  pins required `@vitejs/plugin-react@^6` for Vite 8.

## Sources
- Chat SDK bundled docs (`node_modules/chat/docs/*` at `chat@4.30.0`): `usage`, `posting-messages`, `cards`, `direct-messages`, `handling-events`, `state`.
- `@chat-adapter/gchat@4.30.0` `README.md` + `dist/index.d.ts` (config, JWT verification, Pub/Sub, `openDM`, webhooks).
- [The Complete Guide to Chat SDK](https://vercel.com/kb/guide/the-complete-guide-to-chat-sdk)
- [Verify requests from Google Chat](https://developers.google.com/workspace/chat/verify-requests-from-chat) · [Authenticate as a Google Chat app](https://developers.google.com/workspace/chat/authenticate-authorize-chat-app)
