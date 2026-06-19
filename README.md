# Google Chat Proactive Messenger

A two-way bridge between a companion web page and Google Chat, built on the
open-source **[Vercel Chat SDK](https://chat-sdk.dev)** (`chat`) with its Google
Chat adapter (`@chat-adapter/gchat`).

- **Outbound:** web composer → server → Google Chat (proactive DM from the app).
- **Inbound:** Google Chat → server → web page (live SSE feed + welcome/echo cards).

Implements [`google-chat-cards-requirements.md`](./google-chat-cards-requirements.md).
See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the design.

```
┌────────────┐  POST /api/send   ┌─────────────────────────────┐  Chat SDK     ┌──────────┐
│  Web UI    │ ────────────────▶ │  Server (Hono)              │ openDM().post │ Google   │
│ (composer) │                   │   chat + @chat-adapter/gchat │ ────────────▶ │ Chat     │
│            │ ◀─ SSE /incoming ─│   onDirectMessage / cards    │ ◀── webhook ──│          │
└────────────┘                   │   SQLite recipient registry  │  /api/webhooks└──────────┘
                                 └─────────────────────────────┘     /gchat
```

## Stack

| | |
|---|---|
| Server | Node ≥ 20, TypeScript, **Hono**, `chat` + `@chat-adapter/gchat` + `@chat-adapter/state-memory`, `better-sqlite3`, `zod` |
| Web | React 19, Vite 8 |

`@googleapis/chat` is pulled in transitively by the adapter; we never call it
directly. The adapter handles inbound **JWT verification**, **event
normalization**, **proactive sends**, and **`cardsV2` rendering**.

---

## Project layout

```
server/   Hono server: webhook, recipients, send, SSE feed, cards, bot, store
web/      React + Vite composer
```

Key server modules:
- `src/bot.ts` — Chat SDK instance + `onDirectMessage` (capture, feed, cards)
- `src/index.ts` — Hono app; webhook wrapper handles `ADDED_TO_SPACE` capture and
  `REMOVED_FROM_SPACE` deletion (the SDK only logs removals), then forwards to the SDK
- `src/routes/` — `recipients`, `send` (`bot.openDM().post()`), `incoming` (SSE)
- `src/cards/` — pure `welcomeCard` / `echoCard` builders
- `src/store/` — swappable SQLite recipient registry (separate from SDK state)

---

## 1. Install

```bash
cd server && npm install
cd ../web && npm install
```

## 2. Google Cloud / Chat app setup

1. **Create / pick a GCP project.** Note the **project number**
   (`gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'`).
2. **Enable the Chat API:** `gcloud services enable chat.googleapis.com --project <PROJECT_ID>`
3. **Service-account key** (app identity for sends):
   ```bash
   gcloud iam service-accounts create chatops-app --project <PROJECT_ID>
   gcloud iam service-accounts keys create credentials.json \
     --iam-account=chatops-app@<PROJECT_ID>.iam.gserviceaccount.com
   ```
4. **Public HTTPS tunnel** to the server:
   `cloudflared tunnel --url http://localhost:3978` (or `ngrok http 3978`).
5. **Configure the Chat app** (console → *Google Chat API → Configuration*):
   - App name, avatar, description
   - **Interactive features → Receive 1:1 messages** (enable)
   - **Connection settings → App URL** = `https://<tunnel>/api/webhooks/gchat`
   - **Authentication Audience → Project Number**
   - Visibility → your test users

## 3. Configure env

```bash
cd server && cp .env.example .env      # then edit
cd ../web && cp .env.example .env
```

Server `.env` essentials:
```bash
GOOGLE_CHAT_CREDENTIALS={...service-account JSON on one line...}   # or GOOGLE_CHAT_USE_ADC=true
GOOGLE_CHAT_PROJECT_NUMBER=1234567890
GCHAT_ENDPOINT_URL=https://<tunnel>/api/webhooks/gchat
WEB_APP_URL=http://localhost:5173
WEB_ORIGIN=http://localhost:5173
PORT=3978
```

> **Note:** if `GOOGLE_CHAT_PROJECT_NUMBER` is set, inbound JWTs are **always
> verified** (production behaviour). The dev `ALLOW_INSECURE_EVENTS=true` bypass
> only takes effect when the project number is **unset** — use it for local curl
> testing, never in a shared/deployed environment.

## 4. Run

```bash
# terminal 1
cd server && npm run dev          # http://localhost:3978

# terminal 2 — tunnel; put the https URL into the Chat config App URL
cloudflared tunnel --url http://localhost:3978
smee --url https://smee.io/5aVJadTAZwbKJkx --target http://localhost:3978/api/webhooks/gchat

# terminal 3
cd web && npm run dev             # http://localhost:5173
```

---

## Testing

### Unit tests (no cloud)
```bash
cd server && npm test
```
Covers card builders (§8), the SQLite store (§9), and send-body validation (§6.3).

### Local endpoint smoke tests
`/api/recipients`, `/api/send`, and `/api/incoming` work without cloud. To
exercise the **inbound webhook offline**, run with the dev bypass (project number
unset) and POST synthetic *add-ons-format* events:

```bash
cd server
GOOGLE_CHAT_CREDENTIALS='{...}' ALLOW_INSECURE_EVENTS=true npm run dev
```
```bash
# ADDED_TO_SPACE — captures the recipient
curl -sX POST localhost:3978/api/webhooks/gchat -H 'content-type: application/json' -d '{
  "chat":{"user":{"name":"users/1","displayName":"Ada","email":"ada@example.com"},
  "addedToSpacePayload":{"space":{"name":"spaces/AAA","spaceType":"DIRECT_MESSAGE"}}}}'

curl -s localhost:3978/api/recipients          # → [{ key:"spaces/AAA", ... }]

# SSE feed (separate terminal)
curl -N localhost:3978/api/incoming

# MESSAGE — routes through the SDK, lands in the feed
curl -sX POST localhost:3978/api/webhooks/gchat -H 'content-type: application/json' -d '{
  "chat":{"user":{"name":"users/1","displayName":"Ada"},
  "messagePayload":{"space":{"name":"spaces/AAA","spaceType":"DIRECT_MESSAGE"},
  "message":{"name":"spaces/AAA/messages/m1","createTime":"2026-01-01T00:00:00Z",
  "text":"hi","sender":{"name":"users/1","displayName":"Ada","type":"HUMAN"},
  "space":{"name":"spaces/AAA"},"thread":{"name":"spaces/AAA/threads/t"}}}}}'

# send error paths
curl -sX POST localhost:3978/api/send -H 'content-type: application/json' \
  -d '{"recipientKey":"spaces/NOPE","text":"hi"}' -w '\n%{http_code}\n'   # 404
curl -sX POST localhost:3978/api/send -H 'content-type: application/json' \
  -d '{"recipientKey":"spaces/AAA","text":""}'  -w '\n%{http_code}\n'    # 400
```
> The welcome/echo card post needs **real** credentials; with a throwaway key the
> handler logs an `invalid_grant` and continues (the feed still updates).

### End-to-end
1. DM the app in Google Chat → welcome card appears; you show up in
   `GET /api/recipients` and the web dropdown; your message streams into the feed.
2. In the web app, pick yourself, send → message arrives in the Chat DM from the
   app; UI shows the delivered timestamp.
3. Remove the app from the DM → you disappear from the recipient list.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/webhooks/gchat` | Inbound Google Chat events (JWT verified by adapter) |
| `GET` | `/api/recipients` | Registered recipients (`[{ key, displayName, email?, identifier? }]`) |
| `POST` | `/api/send` | `{ recipientKey, text }` → proactive send. `400`/`404`/`502` errors |
| `GET` | `/api/incoming` | SSE live feed of inbound messages |
| `GET` | `/health` | Liveness |

## Security notes (demo)

- `/api/send` and `/api/recipients` are **unauthenticated** — add auth before any
  real deployment.
- `ALLOW_INSECURE_EVENTS` is **dev-only**.
- The tunnel URL rotates per restart — update the Chat config **App URL**.
- `state-memory` doesn't persist across restarts (SDK subscriptions/dedupe); the
  SQLite recipient registry does. Swap `@chat-adapter/state-pg` for production.
- Stored space references are PII; `server/data/*.db` is git-ignored.
