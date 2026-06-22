import { BadRequestException, Body, Controller, Get, HttpException, Post } from "@nestjs/common";
import { store } from "../store/index.js";
import { cardRegistry } from "../cards/registry.js";
import { buildCard } from "../cards/buildCard.js";
import { cardPresets } from "../cards/presets.js";
import { UpdateCardBody } from "../validation.js";

@Controller("api")
export class CardsController {
  @Get("card-presets")
  presets() {
    return cardPresets;
  }

  @Get("cards")
  list() {
    return store.listCards().map((r) => ({
      messageId: r.messageId,
      recipientKey: r.recipientKey,
      title: r.title,
      spec: JSON.parse(r.specJson),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      live: cardRegistry.get(r.messageId) != null,
    }));
  }

  @Post("cards/update")
  async update(@Body() body: unknown) {
    const parsed = UpdateCardBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "Invalid request", detail: parsed.error.issues });
    }
    const { messageId, text, card } = parsed.data;

    const sent = cardRegistry.get(messageId);
    if (!sent) {
      if (store.getCard(messageId)) {
        throw new HttpException(
          { error: "Card handle expired (server restarted since it was sent). Resend the card." },
          409,
        );
      }
      throw new HttpException({ error: "Unknown card." }, 404);
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
      return { ok: true, messageId, updatedAt };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("Card update failed:", detail);
      throw new HttpException({ error: "Upstream Chat API call failed", detail }, 502);
    }
  }
}
