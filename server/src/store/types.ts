/**
 * Persisted recipient/space record + store interface (requirements §9).
 *
 * This is OUR registry — the data the web app lists (GET /api/recipients) and
 * that POST /api/send looks up. It is separate from the Chat SDK's state adapter
 * (which handles subscriptions, locks, and dedupe, not a queryable directory).
 *
 * The store is swappable behind this interface; sqliteStore is the default.
 */

export interface SpaceRecord {
  /** Recipient key = Google Chat space resource name. Primary key. */
  key: string;
  /** Google Chat space resource name ("spaces/AAAA..."). */
  spaceName: string;
  /** Sender user resource name ("users/12345") — used by bot.openDM() to send. */
  senderId: string;
  /** Chat SDK thread id — alternate send path via bot.thread(threadId). */
  threadId: string;
  /** Sender display name. */
  displayName: string;
  /** Sender email when available (directory scope); null otherwise. */
  email: string | null;
  /** 1 once the welcome card has been sent; 0 if only added/known. (SQLite has no bool.) */
  welcomed: number;
  /** ISO 8601 timestamp of the last upsert. */
  updatedAt: string;
}

/** Shape returned to the web client by GET /api/recipients. */
export interface Recipient {
  key: string;
  displayName: string;
  email?: string;
  identifier?: string;
}

/**
 * A card sent from the web app, persisted so the UI can list prior cards and
 * target one for an update. The live SentMessage handle lives in cards/registry.
 */
export interface SentCardRecord {
  /** Google Chat message resource name ("spaces/X/messages/Y"). Primary key. */
  messageId: string;
  /** Recipient key (space) this card was sent to. */
  recipientKey: string;
  /** Chat SDK thread id the card lives in. */
  threadId: string;
  /** Google Chat space resource name. */
  spaceName: string;
  /** Card title (or a fallback) for display in the sent-cards list. */
  title: string;
  /** Serialized CardSpec (the last spec sent for this message). */
  specJson: string;
  /** ISO 8601 timestamp of first send. */
  createdAt: string;
  /** ISO 8601 timestamp of the last update. */
  updatedAt: string;
}

export interface Store {
  upsert(rec: SpaceRecord): void;
  delete(key: string): void;
  get(key: string): SpaceRecord | undefined;
  list(): SpaceRecord[];

  recordCard(rec: SentCardRecord): void;
  listCards(): SentCardRecord[];
  getCard(messageId: string): SentCardRecord | undefined;
  updateCardSpec(messageId: string, specJson: string, title: string, updatedAt: string): void;
}
