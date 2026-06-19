/**
 * GET /api/recipients (requirements §6.2).
 *
 * Returns stored recipients as [{ key, displayName, email?, identifier? }],
 * ordered by display name (case-insensitive). No auth in the demo — this MUST
 * be protected in production.
 */

import { Hono } from "hono";
import { store } from "../store/index.js";
import type { Recipient } from "../store/types.js";

export const recipientsRoute = new Hono();

recipientsRoute.get("/recipients", (c) => {
  const recipients: Recipient[] = store
    .list()
    .map((r) => ({
      key: r.key,
      displayName: r.displayName,
      ...(r.email ? { email: r.email } : {}),
      identifier: r.senderId || undefined,
    }))
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
    );

  return c.json(recipients);
});
