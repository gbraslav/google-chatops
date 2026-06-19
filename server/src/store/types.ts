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

export interface Store {
  upsert(rec: SpaceRecord): void;
  delete(key: string): void;
  get(key: string): SpaceRecord | undefined;
  list(): SpaceRecord[];
}
