/**
 * Store unit tests (requirements §9) — upsert/get/delete round-trip on a temp DB.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { createSqliteStore } from "../src/store/sqliteStore.js";
import type { SpaceRecord } from "../src/store/types.js";

function tempDbPath(): string {
  return join(tmpdir(), `chatops-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function rec(over: Partial<SpaceRecord> = {}): SpaceRecord {
  return {
    key: "spaces/AAA",
    spaceName: "spaces/AAA",
    senderId: "users/1",
    threadId: "gchat:spaces/AAA",
    displayName: "Ada",
    email: "ada@example.com",
    welcomed: 1,
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

test("upsert then get round-trips a record", () => {
  const path = tempDbPath();
  const store = createSqliteStore(path);
  try {
    store.upsert(rec());
    const got = store.get("spaces/AAA");
    assert.equal(got?.displayName, "Ada");
    assert.equal(got?.email, "ada@example.com");
    assert.equal(got?.welcomed, 1);
  } finally {
    rmSync(path, { force: true });
  }
});

test("upsert updates an existing record (same key)", () => {
  const path = tempDbPath();
  const store = createSqliteStore(path);
  try {
    store.upsert(rec({ welcomed: 0, displayName: "Old" }));
    store.upsert(rec({ welcomed: 1, displayName: "New" }));
    const got = store.get("spaces/AAA");
    assert.equal(got?.displayName, "New");
    assert.equal(got?.welcomed, 1);
    assert.equal(store.list().length, 1);
  } finally {
    rmSync(path, { force: true });
  }
});

test("delete removes the record", () => {
  const path = tempDbPath();
  const store = createSqliteStore(path);
  try {
    store.upsert(rec());
    store.delete("spaces/AAA");
    assert.equal(store.get("spaces/AAA"), undefined);
  } finally {
    rmSync(path, { force: true });
  }
});

test("null email is preserved", () => {
  const path = tempDbPath();
  const store = createSqliteStore(path);
  try {
    store.upsert(rec({ email: null }));
    assert.equal(store.get("spaces/AAA")?.email, null);
  } finally {
    rmSync(path, { force: true });
  }
});
