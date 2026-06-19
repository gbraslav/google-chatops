# Google Chat Proactive Messenger — Requirements

A technology-agnostic requirements document for building the **same product
functionality** as the existing `arnica-test` Microsoft Teams demo, but targeting
**Google Chat** and **Google Chat cards**.

This document describes *what* must be built, not *how* (no prescribed language,
framework, or libraries). It captures all existing functionality across the three
components — **web client**, **server**, and **chat app (cards/manifest)** — and
maps each Teams-specific concept to its Google Chat equivalent.

---

## 1. Product summary

A user opens a companion web page, selects a recipient, types a message, and
clicks **Send**. The message is delivered into Google Chat and appears as a
message from the **chat app** inside the existing direct-message (DM) space
between that user and the app. Messages the user sends *to* the app in Google
Chat are surfaced back in the web page in real time.

The app is a two-way bridge:
- **Outbound:** web page → server → Google Chat (proactive message into an
  existing space).
- **Inbound:** Google Chat → server → web page (live feed of messages the user
  sent to the app, plus card echoes back into Chat).

### Explicitly in scope
- Direct-message (1:1) spaces between a user and the app.
- Sending plain text proactively.
- Sending **cards** (the Google Chat equivalent of Teams Adaptive Cards) on
  install and on each inbound message.
- A local-development setup; single tenant/workspace.

### Explicitly out of scope (matches the original demo)
- End-user OAuth / acting on behalf of a user.
- Multi-workspace publishing / Marketplace listing.
- Production-grade auth on the web→server API, RBAC, rate-limit hardening.
- Production storage (a file-based/embedded DB is acceptable for the demo).

---

## 2. Platform concept mapping (Teams → Google Chat)

The original is built on Microsoft Teams + the Bot Framework / Microsoft 365
Agents SDK. The table below maps every platform concept so the new project can
be built natively on Google Chat.

| Teams / Bot Framework concept | Google Chat equivalent | Notes |
|---|---|---|
| Teams app + manifest | **Google Chat app** configured in a Google Cloud project (Chat API config) | No sideload zip; configuration is done in the Cloud console / via API. |
| Entra ID app registration + client secret | **Google Cloud project** + **service account** (or OAuth client) credentials | Service-account JSON key / Application Default Credentials. |
| Azure Bot resource + Teams channel | **Chat API** enabled on the project + app endpoint registration | The Chat API routes events to the configured HTTPS endpoint (or Pub/Sub). |
| Bot Framework JWT on `/api/messages` | **Google-signed bearer token** on the inbound webhook | Verify the JWT: issuer `chat@system.gserviceaccount.com`, audience = your project number / configured audience. |
| Conversation reference (`tenantId` + `aadObjectId`) | **Space resource name** (`spaces/AAA…`) + sender user id | The space name is the durable handle used to send proactively. |
| `installationUpdate.add` | **`ADDED_TO_SPACE`** event | Fired when the app is added to a space / DM. |
| `installationUpdate.remove` | **`REMOVED_FROM_SPACE`** event | Fired when the app is removed. |
| Inbound `message` activity | **`MESSAGE`** event | Carries sender identity + text. |
| `adapter.continueConversation(ref, …)` | **`spaces.messages.create`** (REST) with stored space name | Proactive send into an existing space. |
| `TeamsInfo.getMember` (resolve email/UPN) | Sender fields on the event payload (`message.sender`) | Google Chat includes `displayName`, and `email` when the app has directory scope; no extra round-trip is usually required. |
| Adaptive Card (`AdaptiveCard` JSON) | **Google Chat card** (`cardsV2`) | Different schema; same role — rich formatted message. |
| Dev tunnel for `/api/messages` | Dev tunnel for the webhook endpoint **or** Pub/Sub push | Google Chat must reach a public HTTPS endpoint; a tunnel works for local dev. |

> **Identity / key design note:** the original keys recipients by
> `tenantId:userAadObjectId`. For Google Chat, the natural durable key is the
> **space resource name** (one DM space per user↔app). The requirements below
> use "recipient key" abstractly — implement it as the space name (optionally
> combined with the sender id) so a stored record can be used directly in
> `spaces.messages.create`.

---

## 3. Architecture

Three deployable units sharing the same shape as the original:

```
┌────────────┐   POST /api/send    ┌──────────────┐  Chat REST API   ┌────────────┐
│  Web UI    │ ──────────────────▶ │   Server     │ ───────────────▶ │ Google     │
│ (composer) │                     │  (backend)   │   (proactive)    │ Chat       │
│            │ ◀── SSE /incoming ─ │              │ ◀── events ───── │            │
└────────────┘                     │  Event hook  │  POST /api/events            │
                                   │  Card builder│                  └────────────┘
                                   │  Space store │
                                   └──────────────┘
```

Two flows share one server process:

1. **Inbound (Chat → server):** an HTTPS endpoint receives Google Chat events
   (`ADDED_TO_SPACE`, `REMOVED_FROM_SPACE`, `MESSAGE`). On add/first message it
   persists the space reference; on message it pushes the message to the web
   feed and echoes a card back.
2. **Outbound (web → Chat):** an endpoint accepts `{ recipientKey, text }`,
   looks up the stored space, and creates a message in that space via the Chat
   REST API.

---

## 4. Component inventory

| # | Component | Purpose |
|---|-----------|---------|
| 1 | **Google Cloud project** | Hosts the Chat API config and credentials. |
| 2 | **Service account / app credentials** | App identity used to call the Chat REST API. |
| 3 | **Google Chat app configuration** | Declares the app name, avatar, scopes, and the inbound event endpoint. |
| 4 | **Public HTTPS ingress** (dev tunnel or Pub/Sub) | Lets Google Chat deliver events to the server during local dev. |
| 5 | **Server backend** | Event webhook, send endpoint, live-feed stream, space store, card builders. |
| 6 | **Web frontend** | Composer UI: recipient list, message box, send, live inbound feed. |
| 7 | **Space reference store** | Persists space resource names + sender metadata, swappable behind an interface. |

---

## 5. Web client requirements

A single-page composer. Functional requirements (mirroring the existing React app):

### 5.1 Recipient selection
- On load, fetch the recipient list from `GET /api/recipients` and populate a
  dropdown.
- Each option shows the recipient **display name**, and **email** when available
  (`"<displayName> — <email>"`, falling back to display name only).
- A **Refresh** button re-fetches the list on demand; show a loading state while
  fetching.
- Preserve the current selection across refreshes when it still exists;
  otherwise default to the first entry.
- **Empty state:** when no recipients exist, show guidance — e.g. *"No one has
  added the app yet. Add it in Google Chat and send it a message to register."*
- Surface a fetch error inline if the list fails to load.

### 5.2 Message composer
- Multi-line text input.
- Character counter with a **maximum length of 4000** characters; show
  remaining count and style it as an error when exceeded.
- **Send** is enabled only when: not currently sending, a recipient is selected,
  and trimmed text is non-empty and within the limit.

### 5.3 Send + status feedback
- Clicking Send calls `POST /api/send` with `{ recipientKey, text }`.
- Status states: **idle → sending → success / error**.
- On success: show a delivered confirmation with the server-provided timestamp,
  and clear the input.
- On error, show a specific message keyed off the HTTP status:
  - `404` → recipient not found ("Have they added the app?").
  - `502` → upstream Chat API call failed (check ingress / credentials).
  - `400` → bad request (validation).
  - other → generic send-failed message.

### 5.4 Live inbound feed
- Open a server-sent-events (or equivalent streaming) connection to
  `GET /api/incoming`.
- Show a connection indicator (e.g. **live** vs **connecting…**).
- Prepend each received message to a list, capped at the **50** most recent.
- Each item shows: sender display name, received time, email/identifier when
  present, and the message text.
- Empty state: *"Nothing yet. Send the app a message in Chat and it will appear
  here."*

### 5.5 Config
- API base URL configurable via environment variable (e.g. `API_BASE`), default
  empty / same-origin.

### 5.6 Cosmetic
- A decorative animation element is present in the original; optional, not a
  functional requirement.

---

## 6. Server requirements

### 6.1 Inbound event endpoint — `POST /api/events`
*(Teams equivalent: `POST /api/messages`.)*

- **Verify the request** is genuinely from Google Chat: validate the
  Google-signed bearer JWT (issuer `chat@system.gserviceaccount.com`, audience =
  the configured project number / app audience). Reject unverified requests with
  `401` before any processing.
- Dispatch on event type:
  - **`ADDED_TO_SPACE`** → capture and persist the space reference (see 6.4),
    then reply with a **welcome card** (see §8).
  - **`MESSAGE`** → capture/refresh the space reference, push the message to the
    live feed (see 6.6), and reply with an **echo card** containing the received
    text.
  - **`REMOVED_FROM_SPACE`** → delete the stored reference for that space.

### 6.2 Recipient list — `GET /api/recipients`
- Return the stored recipients as
  `[{ key, displayName, email?, identifier? }]`, ordered by display name
  (case-insensitive).
- No auth in the demo (document that it must be protected in production).

### 6.3 Proactive send — `POST /api/send`
- Body: `{ recipientKey: string, text: string }`.
- Validate: `recipientKey` non-empty; `text` length **1..4000**. Reject invalid
  bodies with `400`.
- Look up the stored space reference by `recipientKey`; if missing, return
  `404`.
- If app credentials are not configured, return `502` with a clear message.
- Send the text into the space via the Chat REST API
  (`spaces.messages.create`). On upstream failure, return `502` with the error
  detail.
- On success, return `{ ok: true, deliveredAt: <ISO timestamp>, recipientKey }`.

### 6.4 Space reference capture rules
- On `ADDED_TO_SPACE` and on every inbound `MESSAGE`: upsert a record keyed by
  the **space resource name** (the recipient key), storing:
  - space resource name (durable send handle),
  - sender display name,
  - sender email / identifier when available,
  - any additional reference data needed to send later,
  - `updatedAt` timestamp.
- Capturing on message (not only on add) covers the case where the add event was
  missed.
- On `REMOVED_FROM_SPACE`: delete the record.
- If required identity fields are absent, log and skip the capture gracefully
  (do not crash the event handler).

### 6.5 Identity resolution
- Prefer identity fields already on the event payload (`message.sender` →
  display name, email when the app has directory access).
- If a separate lookup is needed to obtain email/identifier, perform it
  best-effort and tolerate failure (log a warning, continue without email).

### 6.6 Live feed — `GET /api/incoming`
- A server-sent-events (or equivalent) stream.
- For each inbound `MESSAGE`, emit an event with:
  `{ displayName, spaceName, senderId, email?, identifier?, text, receivedAt }`.
- Use an in-process pub/sub (event bus) so the event handler can publish and the
  SSE endpoint can subscribe.

### 6.7 Cross-origin + bootstrap
- Allow CORS from the web origin (configurable; default the local dev origin).
- Methods: `GET`, `POST`, `OPTIONS`.
- Validate request bodies (whitelist, reject unknown fields).
- On startup, warn if app credentials are not configured.
- Configurable `PORT` (the original defaults to `3978`).

### 6.8 Error handling
- A top-level handler for unexpected event-processing errors that logs and, when
  possible, sends a friendly fallback message back into the space.

### 6.9 Suggested module layout (illustrative, not prescriptive)
```
server/
├── (bootstrap / CORS / validation)
├── events/        # POST /api/events: verify token, dispatch, card replies
├── send/          # POST /api/send, GET /api/recipients, GET /api/incoming (SSE)
│   └── (send service: spaces.messages.create wrapper)
├── feed/          # in-process event bus for the live feed
└── store/         # space-reference persistence (swappable)
```

---

## 7. Chat app configuration requirements
*(Teams equivalent: the `teams-app/` manifest + zip + sideload.)*

Google Chat has no sideload zip; configuration lives in the Google Cloud project.
Capture the equivalent settings as configuration/documentation:

- **App name / display name:** the product name shown in Chat.
- **Avatar / icon:** the app icon (URL or uploaded asset) — analogous to the
  Teams `color.png` / `outline.png`.
- **Description:** short + long description.
- **Functionality / scope:** enable receiving messages in **direct messages**
  (1:1), matching the original "personal" scope. (Spaces/rooms optional.)
- **Connection / endpoint:** the inbound event endpoint URL (the dev-tunnel
  HTTPS URL → `/api/events`), or a Pub/Sub topic for push delivery.
- **Auth audience:** the project number / audience used to verify inbound JWTs.
- **App credentials:** service-account key (or ADC) the server uses to call the
  Chat REST API.

Document these as a checklist analogous to the Teams manifest fields, plus a
"what you must provision manually" section (Cloud project, Chat API enablement,
credentials, endpoint registration, ingress).

---

## 8. Card requirements
*(Teams equivalent: Adaptive Cards built in the activity handler.)*

Re-implement the two cards as **Google Chat cards** (`cardsV2`). Same content and
intent; only the schema changes.

### 8.1 Welcome card (sent on `ADDED_TO_SPACE`)
- **Greeting:** `"Hi <name> — welcome to <app>"` when a name is known, else a
  generic welcome.
- **Subtitle:** "Proactive messages demo".
- **Body paragraph:** explains the app bridges a companion web app into Google
  Chat, and that the user is now registered as a recipient.
- **"How it works" steps** (the original uses a 3-row fact set):
  1. Open the web app.
  2. Type a message and send.
  3. It appears here as a proactive Chat message.
- **Tip line:** "send any message here to confirm the app has your space
  reference."

### 8.2 Echo card (sent on each inbound `MESSAGE`)
- **Heading:** `"Thanks, <name>"` (or "Thanks").
- **Line:** "You're registered as a recipient. Here's what I received:".
- **Quoted block:** the received text, visually emphasized (use a card section
  with a distinct/emphasis treatment — the original uses an emphasis container).
- **Footer tip:** "Try sending from the web app to see a proactive message land
  here."
- **Action button:** an **open-URL** button (e.g. "Open web app") pointing at
  the web app URL.

### 8.3 Card builders
- Implement as pure functions that take the dynamic inputs (user name, received
  text) and return the card payload — easy to unit test, mirroring the original.

---

## 9. Data model

Persisted recipient/space record (swappable store; embedded DB acceptable for the demo):

| Field | Description |
|-------|-------------|
| `key` | Recipient key = space resource name (primary key, used directly for sending). |
| `spaceName` | Google Chat space resource name (`spaces/…`). |
| `senderId` | Sender user resource name / id. |
| `displayName` | Sender display name. |
| `email` | Sender email when available. |
| `reference` | Any extra data needed to send proactively (serialized). |
| `updatedAt` | ISO timestamp of last upsert. |

- Upsert on add/message; delete on remove.
- Treat stored identity as PII; the store file should be git-ignored and
  resettable by deletion.

---

## 10. Configuration / environment

Server (names illustrative):
```
GOOGLE_PROJECT_NUMBER=<for inbound JWT audience verification>
GOOGLE_APPLICATION_CREDENTIALS=<path to service-account key>   # or ADC
APP_AUDIENCE=<expected JWT audience>
WEB_ORIGIN=<allowed CORS origin, default local dev origin>
PORT=3978
WEB_APP_URL=<used by the echo card's open-URL button>
```

Web:
```
API_BASE=<server base URL, default same-origin / local dev>
```

Secrets must never be committed.

---

## 11. Local development runbook (target shape)

1. Create a Google Cloud project; enable the **Google Chat API**.
2. Create app credentials (service account key or ADC) for calling the REST API.
3. Start a public HTTPS ingress to the server (dev tunnel) — or configure Pub/Sub.
4. In the Chat API config: set the app name/avatar, enable **direct messages**,
   and set the connection endpoint to `https://<tunnel>/api/events` (and the
   auth audience).
5. Start the server; start the web app.
6. In Google Chat, find the app and send it a message (or trigger
   `ADDED_TO_SPACE` by adding it) → confirm it appears in `GET /api/recipients`.
7. In the web app, pick the recipient, type a message, click Send → confirm it
   appears in the Chat DM from the app, and that messages sent to the app appear
   in the web app's live feed.

---

## 12. Security & operational notes (carried over)

- **Verify inbound requests:** always validate the Google-signed JWT on
  `/api/events`; reject anything that doesn't verify.
- **`/api/send` and `/api/recipients` are unauthenticated in the demo** — do not
  deploy as-is; require auth (e.g. an identity-protected SPA) in production.
- **Ingress URL** rotates on each dev-tunnel restart; update the Chat app's
  endpoint when it changes (or use a persistent tunnel / Pub/Sub).
- **CORS** is restricted to the web origin; tighten before deploying.
- **Rate limits:** Google Chat enforces per-app send quotas; surface `429`s to
  the UI.
- **Storage:** the embedded DB is fine for one dev box; production should use a
  real database and treat space references as PII.

---

## 13. Build checklist

- [ ] Google Cloud project created; Chat API enabled
- [ ] App credentials created (service account / ADC)
- [ ] Chat app configured: name, avatar, DM enabled, event endpoint + audience
- [ ] Public HTTPS ingress running; endpoint registered
- [ ] Server: inbound JWT verification working on `/api/events`
- [ ] Space reference captured on add / first message; deleted on remove
- [ ] Welcome card sent on add; echo card sent on each message
- [ ] `GET /api/recipients`, `POST /api/send`, `GET /api/incoming` (SSE) implemented
- [ ] Web app: recipient list, composer with 4000-char limit, send + status, live feed
- [ ] End-to-end: web → proactive Chat message; Chat → web live feed round-trips
```