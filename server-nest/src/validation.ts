/**
 * Request validation schemas (requirements §6.3, §6.7).
 *
 * Kept side-effect free so it can be unit-tested without importing the bot.
 */

import { z } from "zod";

/**
 * CardSpec — the JSON card contract the web app sends and `buildCard` renders to
 * a Chat SDK CardElement. Deliberately mirrors the SDK builder args 1:1 so the
 * mapping in cards/buildCard.ts stays trivial. The `selection`/`actions` widgets
 * and `action` buttons are what make a card interactive (routed via chat.onAction).
 */

const ButtonStyleSchema = z.enum(["primary", "danger", "default"]);

const ButtonSpecSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("link"),
      label: z.string().min(1),
      url: z.string().url(),
      style: ButtonStyleSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("action"),
      label: z.string().min(1),
      id: z.string().min(1),
      value: z.string().optional(),
      style: ButtonStyleSchema.optional(),
    })
    .strict(),
]);

const SelectOptionSpecSchema = z
  .object({ label: z.string().min(1), value: z.string().min(1) })
  .strict();

export type WidgetSpec =
  | { type: "text"; content: string; style?: "bold" | "muted" }
  | { type: "image"; url: string; alt?: string }
  | { type: "divider" }
  | { type: "fields"; fields: { label: string; value: string }[] }
  | { type: "section"; children: WidgetSpec[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "actions"; buttons: z.infer<typeof ButtonSpecSchema>[] }
  | {
      type: "selection";
      id: string;
      label: string;
      kind: "dropdown" | "radio";
      options: { label: string; value: string }[];
      initialOption?: string;
    };

/** Recursive widget schema (section nests widgets), typed via z.lazy. */
export const WidgetSchema: z.ZodType<WidgetSpec> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("text"),
        content: z.string().min(1),
        style: z.enum(["bold", "muted"]).optional(),
      })
      .strict(),
    z
      .object({ type: z.literal("image"), url: z.string().url(), alt: z.string().optional() })
      .strict(),
    z.object({ type: z.literal("divider") }).strict(),
    z
      .object({
        type: z.literal("fields"),
        fields: z
          .array(z.object({ label: z.string(), value: z.string() }).strict())
          .min(1),
      })
      .strict(),
    z
      .object({ type: z.literal("section"), children: z.array(WidgetSchema).min(1) })
      .strict(),
    z
      .object({
        type: z.literal("table"),
        headers: z.array(z.string()).min(1),
        rows: z.array(z.array(z.string())),
      })
      .strict(),
    z.object({ type: z.literal("actions"), buttons: z.array(ButtonSpecSchema).min(1) }).strict(),
    z
      .object({
        type: z.literal("selection"),
        id: z.string().min(1),
        label: z.string().min(1),
        kind: z.enum(["dropdown", "radio"]),
        options: z.array(SelectOptionSpecSchema).min(1),
        initialOption: z.string().optional(),
      })
      .strict(),
  ]),
);

export const CardSpecSchema = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    imageUrl: z.string().url().optional(),
    children: z.array(WidgetSchema).min(1),
  })
  .strict();

export type CardSpec = z.infer<typeof CardSpecSchema>;

/** Exactly one of `text` / `card` must be present. */
const exactlyOne = (d: { text?: unknown; card?: unknown }) =>
  (d.text == null) !== (d.card == null);
const exactlyOneMsg = { message: "Provide exactly one of `text` or `card`." };

/** POST /api/send body: recipientKey + (text 1..4000 | card). */
export const SendBody = z
  .object({
    recipientKey: z.string().min(1),
    text: z.string().min(1).max(4000).optional(),
    card: CardSpecSchema.optional(),
  })
  .strict()
  .refine(exactlyOne, exactlyOneMsg);

export type SendBody = z.infer<typeof SendBody>;

/** POST /api/cards/update body: messageId + (text | card). */
export const UpdateCardBody = z
  .object({
    messageId: z.string().min(1),
    text: z.string().min(1).max(4000).optional(),
    card: CardSpecSchema.optional(),
  })
  .strict()
  .refine(exactlyOne, exactlyOneMsg);

export type UpdateCardBody = z.infer<typeof UpdateCardBody>;
