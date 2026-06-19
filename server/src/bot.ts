/**
 * The Chat SDK bot: Google Chat adapter + inbound event handling.
 *
 * The adapter handles what would otherwise be hand-rolled (requirements §6.1/§12):
 *   - inbound Google-signed JWT verification (googleChatProjectNumber)
 *   - event normalization (ADDED_TO_SPACE / MESSAGE → onDirectMessage)
 *   - proactive sends (bot.openDM(...).post(...))
 *   - rendering cards to cardsV2
 *
 * We own: the recipient registry upsert (§6.4), publishing to the live feed
 * (§6.6), and choosing welcome- vs echo-card (§8).
 */

import { Chat } from "chat";
import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createMemoryState } from "@chat-adapter/state-memory";

import type { GChatEvent } from "./gchatEvents.js";
import { config } from "./config.js";
import { store } from "./store/index.js";
import { bus } from "./feed/bus.js";
import { welcomeCard } from "./cards/welcomeCard.js";
import { echoCard } from "./cards/echoCard.js";

export type Bot = Chat<{ gchat: ReturnType<typeof createGoogleChatAdapter> }>;

/**
 * Build the bot, or return null in "degraded" mode when app credentials are not
 * configured (requirements §6.7). The gchat adapter constructor requires
 * credentials, so we guard it: the server still boots and warns, POST /api/send
 * returns 502, and the webhook returns 503 (requirements §6.3).
 */
function createBot(): Bot | null {
  if (!config.credentialsConfigured) return null;

  const instance = new Chat({
    userName: "ChatOps",
    adapters: {
      gchat: createGoogleChatAdapter({
        // Credentials (GOOGLE_CHAT_CREDENTIALS / ADC) are auto-detected from env.
        googleChatProjectNumber: config.projectNumber,
        endpointUrl: config.endpointUrl,
        // DEV ONLY: lets you POST synthetic events without a real Google JWT.
        disableSignatureVerification: config.allowInsecureEvents,
      }),
    },
    state: createMemoryState(), // swap createPostgresState() for persistence in prod
    dedupeTtlMs: 600_000,
  }).registerSingleton();

  registerHandlers(instance);
  return instance;
}

/**
 * Inbound DM handler (requirements §6.1 MESSAGE, §6.4, §6.5, §6.6, §8).
 * Runs only after the adapter has verified the request.
 */
function registerHandlers(bot: Bot): void {
  bot.onDirectMessage(async (thread, message) => {
  try {
    // message.raw is the full add-ons event; space + email live under it.
    const payload = (message.raw as GChatEvent | undefined)?.chat?.messagePayload;
    const spaceName = payload?.space?.name ?? payload?.message?.space?.name ?? thread.id;
    // Display name + user id are normalized by the SDK onto author.
    const displayName = message.author?.fullName || undefined;
    const senderId = message.author?.userId ?? "";
    // Email is only present when the app has directory scope — best-effort (§6.5).
    const email = payload?.message?.sender?.email ?? null;

    const existing = spaceName ? store.get(spaceName) : undefined;
    // §8: welcome on first contact (new, or added-but-not-yet-welcomed); echo after.
    const shouldWelcome = !existing || existing.welcomed === 0;

    // §6.4: upsert on every message (covers a missed ADDED_TO_SPACE).
    if (spaceName) {
      store.upsert({
        key: spaceName,
        spaceName,
        senderId,
        threadId: thread.id,
        displayName: displayName ?? existing?.displayName ?? "",
        email: email ?? existing?.email ?? null,
        welcomed: 1,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // §6.4: required identity absent — log and skip capture, don't crash.
      console.warn("Skipping capture: no space name on inbound message");
    }

    // §6.6: push to the live feed.
    bus.publish({
      displayName,
      spaceName,
      senderId,
      email,
      text: message.text,
      receivedAt: new Date().toISOString(),
    });

    // §8: welcome card on first contact, echo card thereafter.
    await thread.post(
      shouldWelcome
        ? welcomeCard(displayName, config.webAppUrl)
        : echoCard(displayName, message.text, config.webAppUrl),
    );
  } catch (err) {
    // §6.8: friendly fallback into the space; never crash the handler.
    console.error("onDirectMessage failed:", err);
    try {
      await thread.post("Sorry — something went wrong handling that message.");
    } catch {
      /* swallow secondary failure */
    }
  }
  });
}

/** The bot, or null when credentials are not configured (degraded mode). */
export const bot: Bot | null = createBot();
