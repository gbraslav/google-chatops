/**
 * Minimal typings for the Google Chat "add-ons" event envelope that the
 * @chat-adapter/gchat adapter consumes (event.chat.*Payload).
 *
 * We only model the fields we read:
 *   - message events  → space name + sender email (for capture/feed)
 *   - lifecycle events → ADDED_TO_SPACE / REMOVED_FROM_SPACE space + user
 *
 * The SDK normalizes display name + user id onto message.author already; these
 * types cover the bits that are only available on the raw event.
 */

export interface GChatUser {
  name?: string;
  displayName?: string;
  email?: string;
  type?: string;
}

export interface GChatSpace {
  name?: string;
  type?: string;
  spaceType?: string;
}

export interface GChatMessage {
  space?: GChatSpace;
  sender?: GChatUser;
  text?: string;
}

export interface GChatEvent {
  chat?: {
    user?: GChatUser;
    messagePayload?: { space?: GChatSpace; message?: GChatMessage };
    addedToSpacePayload?: { space?: GChatSpace };
    removedFromSpacePayload?: { space?: GChatSpace };
  };
}
