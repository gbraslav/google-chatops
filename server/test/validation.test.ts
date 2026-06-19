/**
 * Send-body validation tests (requirements §6.3).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SendBody } from "../src/validation.js";

test("accepts a valid body", () => {
  const r = SendBody.safeParse({ recipientKey: "spaces/AAA", text: "hello" });
  assert.ok(r.success);
});

test("rejects empty recipientKey", () => {
  assert.equal(SendBody.safeParse({ recipientKey: "", text: "hi" }).success, false);
});

test("rejects empty text", () => {
  assert.equal(SendBody.safeParse({ recipientKey: "spaces/AAA", text: "" }).success, false);
});

test("rejects text over 4000 chars", () => {
  const text = "x".repeat(4001);
  assert.equal(SendBody.safeParse({ recipientKey: "spaces/AAA", text }).success, false);
});

test("accepts text at exactly 4000 chars", () => {
  const text = "x".repeat(4000);
  assert.ok(SendBody.safeParse({ recipientKey: "spaces/AAA", text }).success);
});

test("rejects unknown fields", () => {
  const r = SendBody.safeParse({ recipientKey: "spaces/AAA", text: "hi", extra: 1 });
  assert.equal(r.success, false);
});
