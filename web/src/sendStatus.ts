/** Shared mapping of a failed request to a user-facing message (§5.3). */

import { SendError } from "./api";

export function errorMessage(err: unknown): string {
  if (err instanceof SendError) {
    switch (err.status) {
      case 404:
        return "Recipient not found. Have they added the app?";
      case 409:
        return err.detail ?? "Card handle expired — resend the card.";
      case 502:
        return "Upstream Chat API call failed. Check ingress / credentials.";
      case 400:
        return `Bad request${err.detail ? `: ${err.detail}` : " (validation failed)."}`;
      default:
        return err.detail ?? "Request failed. Please try again.";
    }
  }
  return "Request failed. Please try again.";
}
