/**
 * GET /api/incoming — SSE live feed. Nest's @Sse maps an RxJS Observable to the
 * event stream; we bridge the in-process feed bus into it. Emits `ready` on
 * connect, `message` per inbound event, and a `ping` keep-alive every 15s.
 */

import { Controller, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { bus, type IncomingFeedEvent } from "../feed/bus.js";

interface SseEvent {
  data: string;
  type: string;
}

@Controller("api")
export class IncomingController {
  @Sse("incoming")
  incoming(): Observable<SseEvent> {
    return new Observable<SseEvent>((subscriber) => {
      // Greet so the client flips its indicator to "live".
      subscriber.next({ type: "ready", data: JSON.stringify({ ok: true }) });

      const unsubscribe = bus.onIncoming((event: IncomingFeedEvent) => {
        subscriber.next({ type: "message", data: JSON.stringify(event) });
      });
      const ping = setInterval(
        () => subscriber.next({ type: "ping", data: "keep-alive" }),
        15_000,
      );

      return () => {
        clearInterval(ping);
        unsubscribe();
      };
    });
  }
}
