/**
 * Singleton recipient/space store, wired to the configured DB path (§9).
 */

import { config } from "../config.js";
import { createSqliteStore } from "./sqliteStore.js";

export const store = createSqliteStore(config.dbPath);

export type { SpaceRecord, Recipient, Store } from "./types.js";
