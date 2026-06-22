import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  NotFoundException,
  Post,
} from "@nestjs/common";
import { bot } from "../bot.js";
import { store } from "../store/index.js";
import { config } from "../config.js";
import { SendBody } from "../validation.js";
import { buildCard } from "../cards/buildCard.js";
import { cardRegistry } from "../cards/registry.js";

@Controller("api")
export class SendController {
  @Post("send")
  async send(@Body() body: unknown) {
    const parsed = SendBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "Invalid request", detail: parsed.error.issues });
    }
    const { recipientKey, text, card } = parsed.data;

    const record = store.get(recipientKey);
    if (!record) {
      throw new NotFoundException({ error: "Recipient not found. Have they added the app?" });
    }
    if (!config.credentialsConfigured || !bot) {
      throw new HttpException(
        { error: "App credentials are not configured (set GOOGLE_CHAT_CREDENTIALS or ADC)." },
        502,
      );
    }

    try {
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
        return { ok: true, deliveredAt, recipientKey, messageId: sent.id };
      }

      await thread.post(text!);
      return { ok: true, deliveredAt, recipientKey };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("Proactive send failed:", detail);
      throw new HttpException({ error: "Upstream Chat API call failed", detail }, 502);
    }
  }
}
