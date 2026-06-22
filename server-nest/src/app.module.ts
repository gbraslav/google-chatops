import { Module } from "@nestjs/common";
import { WebhookController } from "./controllers/webhook.controller.js";
import { RecipientsController } from "./controllers/recipients.controller.js";
import { SendController } from "./controllers/send.controller.js";
import { CardsController } from "./controllers/cards.controller.js";
import { UploadsController } from "./controllers/uploads.controller.js";
import { IncomingController } from "./controllers/incoming.controller.js";
import { HealthController } from "./controllers/health.controller.js";

/**
 * Controllers only — the bot, store, and feed bus are process-level singletons
 * imported directly (same pattern as the Hono server), so no DI providers needed.
 */
@Module({
  controllers: [
    HealthController,
    WebhookController,
    RecipientsController,
    SendController,
    CardsController,
    UploadsController,
    IncomingController,
  ],
})
export class AppModule {}
