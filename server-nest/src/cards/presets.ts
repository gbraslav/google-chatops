/**
 * Card presets — the gallery's CardSpec templates (one per widget type) plus the
 * two interactive presets (counter, approve/reject). Served to the web app via
 * GET /api/card-presets so the gallery and the onAction handlers share one source.
 *
 * Interactive cards carry `action` buttons whose ids are routed by bot.onAction
 * (see bot.ts): "counter:inc" / "counter:reset", "approve" / "reject".
 */

import type { CardSpec, WidgetSpec } from "../validation.js";

export interface CardPreset {
  /** Stable id used by the web gallery. */
  id: string;
  /** Human label shown in the gallery. */
  name: string;
  /** One-line note (also flags Google rendering caveats). */
  description: string;
  /** True when the card has buttons that call back into the server. */
  interactive?: boolean;
  /** The card to send. */
  spec: CardSpec;
}

const SAMPLE_IMAGE = "https://developers.google.com/chat/images/quickstart-app-avatar.png";

/** Interactive counter card. The button value carries the current count. */
export function counterCard(count: number): CardSpec {
  return {
    title: "Interactive counter",
    subtitle: "Click a button in Chat — the card updates in place",
    children: [
      { type: "text", content: `Count: ${count}`, style: "bold" },
      {
        type: "actions",
        buttons: [
          { kind: "action", label: "➕ Increment", id: "counter:inc", value: String(count), style: "primary" },
          { kind: "action", label: "Reset", id: "counter:reset", value: String(count) },
        ],
      },
    ],
  };
}

/** Interactive approval request card (initial state). */
export function approvalCard(): CardSpec {
  return {
    title: "Approval needed",
    subtitle: "Deploy build #421 to production?",
    children: [
      { type: "fields", fields: [
        { label: "Service", value: "checkout-api" },
        { label: "Build", value: "#421" },
        { label: "Requested by", value: "ci-bot" },
      ] },
      {
        type: "actions",
        buttons: [
          { kind: "action", label: "✅ Approve", id: "approve", style: "primary" },
          { kind: "action", label: "❌ Reject", id: "reject", style: "danger" },
        ],
      },
    ],
  };
}

/** Terminal state after an approve/reject click. */
export function approvalResultCard(decision: "approved" | "rejected", by: string): CardSpec {
  const ok = decision === "approved";
  return {
    title: ok ? "✅ Approved" : "❌ Rejected",
    subtitle: "Deploy build #421 to production?",
    children: [
      { type: "fields", fields: [
        { label: "Service", value: "checkout-api" },
        { label: "Build", value: "#421" },
        { label: "Decision", value: `${ok ? "Approved" : "Rejected"} by ${by}` },
      ] },
    ],
  };
}

/** The gallery — display-only widget showcases first, interactive ones last. */
export const cardPresets: CardPreset[] = [
  {
    id: "text-styles",
    name: "Text styles",
    description: "Plain, bold, and muted text. Google supports *bold* / _italic_ only.",
    spec: {
      title: "Text styles",
      subtitle: "What Google renders",
      children: [
        { type: "text", content: "This is plain body text." },
        { type: "text", content: "This is bold.", style: "bold" },
        { type: "text", content: "This is muted/secondary.", style: "muted" },
      ],
    },
  },
  {
    id: "fields",
    name: "Fields",
    description: "Key/value pairs (rendered as decoratedText rows).",
    spec: {
      title: "Deploy summary",
      children: [
        { type: "fields", fields: [
          { label: "Environment", value: "production" },
          { label: "Version", value: "v2.4.0" },
          { label: "Status", value: "healthy" },
        ] },
      ],
    },
  },
  {
    id: "image",
    name: "Image",
    description: "An embedded image widget.",
    spec: {
      title: "Image widget",
      children: [
        { type: "text", content: "Below is an image widget:" },
        { type: "image", url: SAMPLE_IMAGE, alt: "Sample avatar" },
      ],
    },
  },
  {
    id: "divider-sections",
    name: "Sections + divider",
    description: "Two sections separated by a divider.",
    spec: {
      title: "Sections",
      children: [
        { type: "section", children: [
          { type: "text", content: "First section", style: "bold" },
          { type: "text", content: "Some content here." },
        ] },
        { type: "divider" },
        { type: "section", children: [
          { type: "text", content: "Second section", style: "bold" },
          { type: "text", content: "More content here." },
        ] },
      ],
    },
  },
  {
    id: "link-button",
    name: "Link button",
    description: "A button that opens a URL (openLink).",
    spec: {
      title: "Link button",
      children: [
        { type: "text", content: "Open an external link:" },
        { type: "actions", buttons: [
          { kind: "link", label: "Open Google Chat docs", url: "https://developers.google.com/chat", style: "primary" },
        ] },
      ],
    },
  },
  {
    id: "selection",
    name: "Interactive: selection inputs",
    description: "Pick values and Submit — the server reads the inputs and rewrites the card.",
    interactive: true,
    spec: {
      title: "Selection inputs",
      children: [
        { type: "selection", id: "priority", label: "Priority", kind: "dropdown",
          options: [
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
          ], initialOption: "medium" },
        { type: "selection", id: "env", label: "Environment", kind: "radio",
          options: [
            { label: "Staging", value: "staging" },
            { label: "Production", value: "production" },
          ] },
        { type: "actions", buttons: [
          { kind: "action", label: "Submit selections", id: "selection:submit", style: "primary" },
        ] },
      ],
    },
  },
  {
    id: "table",
    name: "Table",
    description: "Caveat: Google has no table widget — rendered as monospace ASCII.",
    spec: {
      title: "Table (ASCII fallback)",
      children: [
        { type: "table",
          headers: ["Name", "Role", "Status"],
          rows: [
            ["Alice", "Engineer", "Active"],
            ["Bob", "Designer", "Away"],
          ] },
      ],
    },
  },
  {
    id: "counter",
    name: "Interactive: counter",
    description: "Buttons that update the card in place when clicked in Chat.",
    interactive: true,
    spec: counterCard(0),
  },
  {
    id: "approval",
    name: "Interactive: approve / reject",
    description: "Approve or reject; the card rewrites to a terminal state.",
    interactive: true,
    spec: approvalCard(),
  },
];

const RESULT_HEADING = "✅ Submitted selections";

function isResultSection(w: WidgetSpec): boolean {
  if (w.type !== "section") return false;
  const head = w.children[0];
  return head?.type === "text" && head.content === RESULT_HEADING;
}

/**
 * Rebuild a sent card to reflect submitted selection inputs: echo each value back
 * into its selection (so the choice sticks), and append a result section listing
 * what was selected. Idempotent — replaces any prior result section so repeated
 * submits don't stack.
 */
export function applySelectionResult(base: CardSpec, inputs: Record<string, string>): CardSpec {
  const children: WidgetSpec[] = base.children
    .filter((w) => !isResultSection(w))
    .map((w) =>
      w.type === "selection" && inputs[w.id] != null ? { ...w, initialOption: inputs[w.id] } : w,
    );

  const fields = Object.entries(inputs).map(([id, value]) => {
    const sel = base.children.find(
      (w): w is Extract<WidgetSpec, { type: "selection" }> => w.type === "selection" && w.id === id,
    );
    return { label: sel?.label ?? id, value };
  });

  const resultSection: WidgetSpec = {
    type: "section",
    children: [
      { type: "text", content: RESULT_HEADING, style: "bold" },
      fields.length
        ? { type: "fields", fields }
        : { type: "text", content: "(no inputs received)", style: "muted" },
    ],
  };

  return { ...base, children: [...children, resultSection] };
}
