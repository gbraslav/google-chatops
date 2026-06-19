/**
 * GET /api/incoming — Server-Sent Events live feed (requirements §6.6).
 *
 * Subscribes to the in-process feed bus and streams each inbound MESSAGE to the
 * web client. Emits keep-alive comments so proxies don't drop idle connections,
 * and cleans up the subscription when the client disconnects.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { bus, type IncomingFeedEvent } from "../feed/bus.js";

export const incomingRoute = new Hono();

incomingRoute.get("/incoming", (c) => {
  return streamSSE(c, async (stream) => {
    // Buffer events emitted while a previous write is in flight.
    const queue: IncomingFeedEvent[] = [];
    let notify: (() => void) | null = null;

    const unsubscribe = bus.onIncoming((event) => {
      queue.push(event);
      notify?.();
    });

    let open = true;
    stream.onAbort(() => {
      open = false;
      unsubscribe();
      notify?.();
    });

    // Greet so the client can flip its indicator to "live".
    await stream.writeSSE({ event: "ready", data: JSON.stringify({ ok: true }) });

    while (open) {
      while (queue.length > 0) {
        const event = queue.shift()!;
        await stream.writeSSE({ event: "message", data: JSON.stringify(event) });
      }
      if (!open) break;
      // Wait for the next event or a 15s keep-alive, whichever comes first.
      await new Promise<void>((resolve) => {
        notify = resolve;
        setTimeout(resolve, 15_000);
      });
      notify = null;
      if (open && queue.length === 0) {
        await stream.writeSSE({ event: "ping", data: "keep-alive" });
      }
    }
  });
});
