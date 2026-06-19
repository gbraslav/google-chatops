/**
 * Card builder unit tests (requirements §8.3 — pure functions).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { welcomeCard } from "../src/cards/welcomeCard.js";
import { echoCard } from "../src/cards/echoCard.js";

const WEB = "https://web.example";

/** Collect all string values anywhere in the card tree, for content assertions. */
function flatten(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => flatten(n, out));
  else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) flatten(v, out);
  }
  return out;
}

test("welcomeCard greets by name when provided", () => {
  const card = welcomeCard("Ada", WEB);
  assert.equal(card.title, "Hi Ada — welcome to ChatOps");
  assert.equal(card.subtitle, "Proactive messages demo");
});

test("welcomeCard uses a generic title when no name", () => {
  const card = welcomeCard(undefined, WEB);
  assert.equal(card.title, "Welcome to ChatOps");
});

test("welcomeCard includes the 3 how-it-works steps and web app link", () => {
  const strings = flatten(welcomeCard("Ada", WEB));
  assert.ok(strings.includes("Open the web app"));
  assert.ok(strings.includes("Type a message and send"));
  assert.ok(strings.includes("It appears here as a proactive Chat message"));
  assert.ok(strings.includes(WEB), "should contain the web app URL");
});

test("echoCard heads with the name and quotes the received text", () => {
  const card = echoCard("Ada", "hello there", WEB);
  assert.equal(card.title, "Thanks, Ada");
  const strings = flatten(card);
  assert.ok(strings.includes("hello there"), "should include received text");
  assert.ok(strings.includes(WEB), "should include open-url button target");
});

test("echoCard falls back to 'Thanks' without a name", () => {
  assert.equal(echoCard(undefined, "x", WEB).title, "Thanks");
});
