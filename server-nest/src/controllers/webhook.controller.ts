/**
 * POST /api/webhooks/gchat — the one route that needs real work on Express.
 *
 * The gchat adapter is Fetch-native: bot.webhooks.gchat(req: Request) → Response.
 * Express gives us Node req/res, so we bridge: build a Web Request from the parsed
 * body + headers, hand it to the adapter, then write the Web Response back to res.
 *
 * Same normalization as the Hono server: unwrap a Workspace add-on `{ payload }`
 * envelope, and lift a body `systemIdToken` into the Authorization header (the
 * adapter only reads the header). We send the adapter just what it needs —
 * authorization + a JSON body — which also sidesteps forbidden-header issues.
 */

import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { bot } from "../bot.js";
import { store } from "../store/index.js";
import type { GChatEvent } from "../gchatEvents.js";

// `Request`/`Response` below are the global Fetch types the adapter consumes.
function buildWebRequest(req: ExpressRequest): { request: Request; event: GChatEvent | null } {
  const parsed = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const wrapped =
    !!parsed.payload &&
    typeof parsed.payload === "object" &&
    !parsed.chat &&
    !parsed.commonEventObject;
  const inner = (wrapped ? parsed.payload : parsed) as Record<string, unknown>;

  const headers = new Headers({ "content-type": "application/json" });
  const auth = req.headers["authorization"];
  if (typeof auth === "string") headers.set("authorization", auth);
  const systemIdToken = (inner.authorizationEventObject as { systemIdToken?: unknown } | undefined)
    ?.systemIdToken;
  if (!headers.has("authorization") && typeof systemIdToken === "string") {
    headers.set("authorization", `Bearer ${systemIdToken}`);
  }

  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const request = new Request(url, { method: "POST", headers, body: JSON.stringify(inner) });
  return { request, event: inner as GChatEvent };
}

@Controller("api")
export class WebhookController {
  @Post("webhooks/gchat")
  async webhook(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    const { request, event } = buildWebRequest(req);

    // Lifecycle events the SDK doesn't act on (§6.4) — capture / delete recipients.
    const chat = event?.chat;
    const removedSpace = chat?.removedFromSpacePayload?.space?.name;
    const addedSpace = chat?.addedToSpacePayload?.space?.name;
    if (removedSpace) {
      store.delete(removedSpace);
    } else if (addedSpace) {
      store.upsert({
        key: addedSpace,
        spaceName: addedSpace,
        senderId: chat?.user?.name ?? "",
        threadId: "",
        displayName: chat?.user?.displayName ?? "",
        email: chat?.user?.email ?? null,
        welcomed: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    if (!bot) {
      res.status(503).json({ error: "Chat app is not configured (missing credentials)." });
      return;
    }

    const resp = await bot.webhooks.gchat(request, { waitUntil: (p) => p });
    res.status(resp.status);
    resp.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(Buffer.from(await resp.arrayBuffer()));
  }
}
