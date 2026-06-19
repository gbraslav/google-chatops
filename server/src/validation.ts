/**
 * Request validation schemas (requirements §6.3, §6.7).
 *
 * Kept side-effect free so it can be unit-tested without importing the bot.
 */

import { z } from "zod";

/** POST /api/send body: recipientKey non-empty, text length 1..4000. */
export const SendBody = z
  .object({
    recipientKey: z.string().min(1),
    text: z.string().min(1).max(4000),
  })
  .strict(); // reject unknown fields

export type SendBody = z.infer<typeof SendBody>;
