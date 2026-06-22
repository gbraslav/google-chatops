/**
 * buildCard — render a JSON CardSpec (the web app's contract) into a Chat SDK
 * CardElement that the gchat adapter converts to Google Chat cardsV2.
 *
 * Mirrors the builder usage in welcomeCard.ts. Centralized so the gallery, the
 * freeform builder, and the interactive onAction handlers all render the same way.
 */

import {
  Card,
  CardText,
  Section,
  Fields,
  Field,
  Actions,
  Button,
  LinkButton,
  Image,
  Divider,
  Table,
  Select,
  RadioSelect,
  SelectOption,
} from "chat";
import type {
  CardElement,
  CardChild,
  ButtonElement,
  LinkButtonElement,
  SelectElement,
  RadioSelectElement,
} from "chat";
import type { CardSpec, WidgetSpec } from "../validation.js";

type ButtonSpec = Extract<WidgetSpec, { type: "actions" }>["buttons"][number];
type ActionChild = ButtonElement | LinkButtonElement | SelectElement | RadioSelectElement;

/** Google Chat only supports primary/danger button colors; treat "default" as unstyled. */
function normalizeStyle(style?: "primary" | "danger" | "default") {
  return style && style !== "default" ? style : undefined;
}

function buttonToElement(b: ButtonSpec): ButtonElement | LinkButtonElement {
  if (b.kind === "link") {
    return LinkButton({ url: b.url, label: b.label, style: normalizeStyle(b.style) });
  }
  return Button({ id: b.id, label: b.label, value: b.value, style: normalizeStyle(b.style) });
}

function selectionToElement(
  w: Extract<WidgetSpec, { type: "selection" }>,
): SelectElement | RadioSelectElement {
  const options = w.options.map((o) => SelectOption({ label: o.label, value: o.value }));
  const base = { id: w.id, label: w.label, options, initialOption: w.initialOption };
  return w.kind === "radio" ? RadioSelect(base) : Select(base);
}

function widgetToChild(w: WidgetSpec): CardChild {
  switch (w.type) {
    case "text":
      return CardText(w.content, w.style ? { style: w.style } : undefined);
    case "image":
      return Image({ url: w.url, alt: w.alt });
    case "divider":
      return Divider();
    case "fields":
      return Fields(w.fields.map((f) => Field({ label: f.label, value: f.value })));
    case "section":
      return Section(w.children.map(widgetToChild));
    case "table":
      return Table({ headers: w.headers, rows: w.rows });
    case "actions":
      return Actions(w.buttons.map(buttonToElement) as ActionChild[]);
    case "selection":
      return Actions([selectionToElement(w)]);
  }
}

export function buildCard(spec: CardSpec): CardElement {
  return Card({
    title: spec.title,
    subtitle: spec.subtitle,
    imageUrl: spec.imageUrl,
    children: spec.children.map(widgetToChild),
  });
}
