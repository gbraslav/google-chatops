/**
 * In-process pub/sub for the live inbound feed (requirements §6.6).
 *
 * The event handler publishes inbound messages; the SSE endpoint subscribes.
 * A single module-level EventEmitter is the simplest fit for a one-process demo.
 */

import { EventEmitter } from "node:events";

export interface IncomingFeedEvent {
  displayName?: string;
  spaceName: string;
  senderId?: string;
  email?: string | null;
  identifier?: string;
  text: string;
  receivedAt: string;
}

class FeedBus extends EventEmitter {
  publish(event: IncomingFeedEvent): void {
    this.emit("incoming", event);
  }
  onIncoming(listener: (event: IncomingFeedEvent) => void): () => void {
    this.on("incoming", listener);
    return () => this.off("incoming", listener);
  }
}

export const bus = new FeedBus();
// A feed connection per browser tab; lift the default listener cap accordingly.
bus.setMaxListeners(100);
