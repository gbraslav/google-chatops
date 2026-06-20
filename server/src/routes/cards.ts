/**
 * Card routes:
 *   GET  /api/card-presets        — the gallery's CardSpec templates (single source).
 *   GET  /api/cards               — previously-sent cards, for the update UI.
 *   POST /api/cards/update        — edit a sent card in place via SentMessage.edit().
 *
 * messageId lives in the body (not the path) because Google message ids contain
 * slashes ("spaces/X/messages/Y").
 */

import { Hono } from "hono";
import { store } from "../store/index.js";
import { cardRegistry } from "../cards/registry.js";
import { buildCard } from "../cards/buildCard.js";
import { cardPresets } from "../cards/presets.js";
import { UpdateCardBody } from "../validation.js";

export const cardsRoute = new Hono();

cardsRoute.get("/card-presets", (c) => c.json(cardPresets));

cardsRoute.get("/cards", (c) => {
  const cards = store.listCards().map((r) => ({
    messageId: r.messageId,
    recipientKey: r.recipientKey,
    title: r.title,
    spec: JSON.parse(r.specJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // Whether the live handle is still in memory (false after a server restart).
    live: cardRegistry.get(r.messageId) != null,
  }));
  return c.json(cards);
});

cardsRoute.post("/cards/update", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = UpdateCardBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.issues }, 400);
  }
  const { messageId, text, card } = parsed.data;

  const sent = cardRegistry.get(messageId);
  if (!sent) {
    // Known to the store but no live handle → process restarted since it was sent.
    if (store.getCard(messageId)) {
      return c.json(
        { error: "Card handle expired (server restarted since it was sent). Resend the card." },
        409,
      );
    }
    return c.json({ error: "Unknown card." }, 404);
  }

  try {
    const updatedAt = new Date().toISOString();
    if (card) {
      await sent.edit(buildCard(card));
      store.updateCardSpec(messageId, JSON.stringify(card), card.title ?? "(untitled card)", updatedAt);
    } else {
      await sent.edit(text!);
      store.updateCardSpec(messageId, JSON.stringify({ text }), "(text update)", updatedAt);
    }
    return c.json({ ok: true, messageId, updatedAt });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Card update failed:", detail);
    return c.json({ error: "Upstream Chat API call failed", detail }, 502);
  }
});
