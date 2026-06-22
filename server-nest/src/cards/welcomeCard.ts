/**
 * Welcome card — sent on first contact / ADDED_TO_SPACE (requirements §8.1).
 *
 * Pure function: takes the dynamic input (user name, app/web details) and
 * returns a Chat SDK CardElement, which the gchat adapter renders to cardsV2.
 */

import { Card, CardText, Section, Fields, Field, Actions, LinkButton } from "chat";
import type { CardElement } from "chat";

const APP_NAME = "ChatOps";

export function welcomeCard(name: string | undefined, webAppUrl: string): CardElement {
  return Card({
    title: name ? `Hi ${name} — welcome to ${APP_NAME}` : `Welcome to ${APP_NAME}`,
    subtitle: "Proactive messages demo",
    children: [
      CardText(
        `This app bridges a companion web app into Google Chat. ` +
          `You're now registered as a recipient.`,
      ),
      Section([
        CardText("How it works", { style: "bold" }),
        Fields([
          Field({ label: "1", value: "Open the web app" }),
          Field({ label: "2", value: "Type a message and send" }),
          Field({ label: "3", value: "It appears here as a proactive Chat message" }),
        ]),
      ]),
      CardText(
        "Tip: send any message here to confirm the app has your space reference.",
        { style: "muted" },
      ),
      Actions([LinkButton({ url: webAppUrl, label: "Open web app" })]),
    ],
  });
}
