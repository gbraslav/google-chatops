/**
 * Echo card — sent on each inbound MESSAGE (requirements §8.2).
 *
 * Pure function: takes the user name + received text and returns a CardElement.
 * The received text is shown in its own emphasized section, with an open-URL
 * button back to the web app.
 */

import { Card, CardText, Section, Actions, LinkButton } from "chat";
import type { CardElement } from "chat";

export function echoCard(
  name: string | undefined,
  receivedText: string,
  webAppUrl: string,
): CardElement {
  return Card({
    title: name ? `Thanks, ${name}` : "Thanks",
    children: [
      CardText("You're registered as a recipient. Here's what I received:"),
      Section([CardText(receivedText, { style: "bold" })]),
      CardText(
        "Try sending from the web app to see a proactive message land here.",
        { style: "muted" },
      ),
      Actions([LinkButton({ url: webAppUrl, label: "Open web app" })]),
    ],
  });
}
