/**
 * buildCard unit tests — CardSpec (JSON) → Chat SDK CardElement mapping.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCard } from "../src/cards/buildCard.js";
import {
  counterCard,
  approvalCard,
  cardPresets,
  applySelectionResult,
} from "../src/cards/presets.js";
import type { CardSpec, WidgetSpec } from "../src/validation.js";

/** Collect every node of a given `type` anywhere in the card tree. */
function collect(node: unknown, type: string, out: Record<string, unknown>[] = []) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, type, out));
  else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === type) out.push(obj);
    for (const v of Object.values(obj)) collect(v, type, out);
  }
  return out;
}

test("maps title/subtitle and a text widget", () => {
  const card = buildCard({
    title: "Hello",
    subtitle: "Sub",
    children: [{ type: "text", content: "body" }],
  });
  assert.equal(card.title, "Hello");
  assert.equal(card.subtitle, "Sub");
  assert.equal(collect(card, "text").length, 1);
});

test("maps each widget type to its element", () => {
  const spec: CardSpec = {
    children: [
      { type: "text", content: "t", style: "bold" },
      { type: "image", url: "https://x/y.png", alt: "a" },
      { type: "divider" },
      { type: "fields", fields: [{ label: "k", value: "v" }] },
      { type: "section", children: [{ type: "text", content: "s" }] },
      { type: "table", headers: ["h"], rows: [["r"]] },
      { type: "actions", buttons: [{ kind: "link", label: "L", url: "https://x" }] },
      { type: "selection", id: "s", label: "S", kind: "dropdown", options: [{ label: "o", value: "o" }] },
    ],
  };
  const card = buildCard(spec);
  assert.ok(collect(card, "image").length >= 1);
  assert.ok(collect(card, "divider").length >= 1);
  assert.ok(collect(card, "table").length >= 1);
  assert.ok(collect(card, "section").length >= 1);
  assert.ok(collect(card, "select").length >= 1, "selection → select element");
  // link + action buttons live inside actions containers
  assert.ok(collect(card, "actions").length >= 1);
});

test("counter preset carries the counter:inc action with the current count", () => {
  const card = buildCard(counterCard(4));
  const buttons = collect(card, "button");
  const inc = buttons.find((b) => b.id === "counter:inc");
  assert.ok(inc, "has an increment button");
  assert.equal(inc!.value, "4");
});

test("approval preset has approve and reject actions", () => {
  const card = buildCard(approvalCard());
  const ids = collect(card, "button").map((b) => b.id);
  assert.ok(ids.includes("approve"));
  assert.ok(ids.includes("reject"));
});

test("every gallery preset renders without throwing", () => {
  for (const p of cardPresets) {
    assert.doesNotThrow(() => buildCard(p.spec), `preset ${p.id} should render`);
  }
});

test("applySelectionResult echoes choices and is idempotent", () => {
  const isResult = (w: WidgetSpec): boolean => {
    if (w.type !== "section") return false;
    const head = w.children[0];
    return head?.type === "text" && head.content.includes("Submitted");
  };

  const base = cardPresets.find((p) => p.id === "selection")!.spec;
  const once = applySelectionResult(base, { priority: "high", env: "production" });

  // selection widgets reflect the submitted values
  const priority = once.children.find((w) => w.type === "selection" && w.id === "priority");
  assert.equal(priority && priority.type === "selection" && priority.initialOption, "high");

  // a single result section is appended, listing the choices
  const result = once.children.find(isResult);
  assert.ok(result, "has a result section");
  const flat = JSON.stringify(result);
  assert.ok(flat.includes("Priority") && flat.includes("high"));
  assert.ok(flat.includes("Environment") && flat.includes("production"));

  // re-submitting replaces (not stacks) the result section
  const twice = applySelectionResult(once, { priority: "low", env: "staging" });
  assert.equal(twice.children.filter(isResult).length, 1, "result section is replaced, not stacked");
  assert.ok(JSON.stringify(twice).includes("low"));
});
