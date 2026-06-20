/**
 * Send-body validation tests (requirements §6.3).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SendBody, UpdateCardBody } from "../src/validation.js";

const CARD = { title: "T", children: [{ type: "text", content: "hi" }] };

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

test("accepts a card body", () => {
  assert.ok(SendBody.safeParse({ recipientKey: "spaces/AAA", card: CARD }).success);
});

test("rejects body with both text and card", () => {
  const r = SendBody.safeParse({ recipientKey: "spaces/AAA", text: "hi", card: CARD });
  assert.equal(r.success, false);
});

test("rejects body with neither text nor card", () => {
  assert.equal(SendBody.safeParse({ recipientKey: "spaces/AAA" }).success, false);
});

test("rejects a card with an unknown widget type", () => {
  const bad = { title: "T", children: [{ type: "bogus" }] };
  assert.equal(SendBody.safeParse({ recipientKey: "spaces/AAA", card: bad }).success, false);
});

test("accepts nested sections and action buttons", () => {
  const card = {
    title: "T",
    children: [
      { type: "section", children: [{ type: "text", content: "x" }] },
      { type: "actions", buttons: [{ kind: "action", label: "Go", id: "go", value: "1" }] },
    ],
  };
  assert.ok(SendBody.safeParse({ recipientKey: "spaces/AAA", card }).success);
});

test("UpdateCardBody requires messageId + exactly one of text/card", () => {
  assert.ok(UpdateCardBody.safeParse({ messageId: "spaces/A/messages/B", card: CARD }).success);
  assert.equal(UpdateCardBody.safeParse({ card: CARD }).success, false);
  assert.equal(
    UpdateCardBody.safeParse({ messageId: "m", text: "hi", card: CARD }).success,
    false,
  );
});
