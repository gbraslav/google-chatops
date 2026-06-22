/**
 * In-process registry of sent card handles, keyed by Google message id.
 *
 * A card is updated in place via its SentMessage.edit(). That handle only lives
 * for the process lifetime — persisted metadata (store: sent_cards) survives
 * restarts for listing, but a post-restart edit can't reuse the handle and the
 * update route returns 409 ("resend"). Fine for a demo.
 */

import type { SentMessage } from "chat";

const handles = new Map<string, SentMessage>();

export const cardRegistry = {
  set(messageId: string, message: SentMessage): void {
    handles.set(messageId, message);
  },
  get(messageId: string): SentMessage | undefined {
    return handles.get(messageId);
  },
  delete(messageId: string): void {
    handles.delete(messageId);
  },
};
