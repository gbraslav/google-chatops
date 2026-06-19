/**
 * better-sqlite3 implementation of the recipient/space Store (requirements §9).
 *
 * Embedded, file-based, git-ignored, resettable by deleting the .db file.
 * Upsert on add/message; delete on remove. Stored identity is PII.
 */

import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { SpaceRecord, Store } from "./types.js";

export function createSqliteStore(dbPath: string): Store {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      key         TEXT PRIMARY KEY,
      spaceName   TEXT NOT NULL,
      senderId    TEXT NOT NULL,
      threadId    TEXT NOT NULL,
      displayName TEXT NOT NULL,
      email       TEXT,
      welcomed    INTEGER NOT NULL DEFAULT 0,
      updatedAt   TEXT NOT NULL
    );
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO spaces (key, spaceName, senderId, threadId, displayName, email, welcomed, updatedAt)
    VALUES (@key, @spaceName, @senderId, @threadId, @displayName, @email, @welcomed, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      spaceName   = excluded.spaceName,
      senderId    = excluded.senderId,
      threadId    = excluded.threadId,
      displayName = excluded.displayName,
      email       = excluded.email,
      welcomed    = excluded.welcomed,
      updatedAt   = excluded.updatedAt
  `);
  const deleteStmt = db.prepare(`DELETE FROM spaces WHERE key = ?`);
  const getStmt = db.prepare(`SELECT * FROM spaces WHERE key = ?`);
  const listStmt = db.prepare(`SELECT * FROM spaces`);

  return {
    upsert(rec: SpaceRecord) {
      upsertStmt.run(rec);
    },
    delete(key: string) {
      deleteStmt.run(key);
    },
    get(key: string): SpaceRecord | undefined {
      return getStmt.get(key) as SpaceRecord | undefined;
    },
    list(): SpaceRecord[] {
      return listStmt.all() as SpaceRecord[];
    },
  };
}
