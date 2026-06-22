import { Controller, Get } from "@nestjs/common";
import { store } from "../store/index.js";
import type { Recipient } from "../store/types.js";

@Controller("api")
export class RecipientsController {
  @Get("recipients")
  list(): Recipient[] {
    return store
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
  }
}
