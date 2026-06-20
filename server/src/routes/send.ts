/**
 * POST /api/send (requirements §6.3).
 *
 * Body: { recipientKey, text } OR { recipientKey, card }. Validates, looks up the
 * stored space, and sends proactively via the Chat SDK (bot.openDM().post()).
 * For cards we capture the returned SentMessage so it can be updated later
 * (registry + persisted metadata). Error contract:
 *   400 invalid body · 404 unknown recipient · 502 no creds / upstream failure.
 */

import { Hono } from "hono";
import { bot } from "../bot.js";
import { store } from "../store/index.js";
import { config } from "../config.js";
import { SendBody } from "../validation.js";
import { buildCard } from "../cards/buildCard.js";
import { cardRegistry } from "../cards/registry.js";

export const sendRoute = new Hono();

sendRoute.post("/send", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = SendBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.issues }, 400);
  }
  const { recipientKey, text, card } = parsed.data;

  const record = store.get(recipientKey);
  if (!record) {
    return c.json({ error: "Recipient not found. Have they added the app?" }, 404);
  }

  if (!config.credentialsConfigured || !bot) {
    return c.json(
      { error: "App credentials are not configured (set GOOGLE_CHAT_CREDENTIALS or ADC)." },
      502,
    );
  }

  try {
    // Primary path: open the DM by the stored user id; fall back to the thread.
    const thread = record.senderId
      ? await bot.openDM(record.senderId)
      : bot.thread(record.threadId);

    const deliveredAt = new Date().toISOString();

    if (card) {
      const sent = await thread.post(buildCard(card));
      cardRegistry.set(sent.id, sent);
      store.recordCard({
        messageId: sent.id,
        recipientKey,
        threadId: thread.id,
        spaceName: record.spaceName,
        title: card.title ?? "(untitled card)",
        specJson: JSON.stringify(card),
        createdAt: deliveredAt,
        updatedAt: deliveredAt,
      });
      return c.json({ ok: true, deliveredAt, recipientKey, messageId: sent.id });
    }

    await thread.post(text!);
    return c.json({ ok: true, deliveredAt, recipientKey });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Proactive send failed:", detail);
    return c.json({ error: "Upstream Chat API call failed", detail }, 502);
  }
});
