/**
 * NestJS (Express) bootstrap — the parallel implementation of the Hono server.
 *
 * Same surface and behaviour; the framework-agnostic core (bot, cards, store,
 * validation, feed) is shared verbatim with ../server. Only the HTTP edge differs.
 *
 * Runs as ESM (the `chat` SDK + gchat adapter are ESM-only) compiled by tsc, so
 * decorator metadata is emitted correctly for Nest.
 */

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";

async function bootstrap(): Promise<void> {
  // Disable Nest's default body parser so we can raise the JSON limit (Chat events
  // with tokens/avatars exceed the 100kb default). Multipart uploads are handled
  // separately by multer via FileInterceptor.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  app.enableCors({
    origin: config.webOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });

  if (!config.credentialsConfigured) {
    console.warn(
      "⚠️  Google Chat app credentials are not configured — POST /api/send returns 502 " +
        "until you set GOOGLE_CHAT_CREDENTIALS or enable ADC.",
    );
  }
  if (config.allowInsecureEvents) {
    console.warn("⚠️  ALLOW_INSECURE_EVENTS is on — inbound webhook JWT verification is DISABLED.");
  }

  await app.listen(config.port);
  console.log(`[nest] Server listening on http://localhost:${config.port}`);
  console.log(`  webhook:    POST /api/webhooks/gchat`);
  console.log(`  recipients: GET  /api/recipients`);
  console.log(`  send:       POST /api/send`);
  console.log(`  cards:      GET  /api/cards · POST /api/cards/update · GET /api/card-presets`);
  console.log(`  uploads:    POST /api/uploads · GET /api/uploads/:id`);
  console.log(`  feed (SSE): GET  /api/incoming`);
  if (!config.publicBaseUrl) {
    console.log(
      "  note:       PUBLIC_BASE_URL unset — uploaded card images render in the builder " +
        "preview but NOT in Chat.",
    );
  }
}

void bootstrap();
