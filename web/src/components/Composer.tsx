/**
 * Message composer + send status (requirements §5.2, §5.3).
 */

import { useState } from "react";
import { send, SendError, type Recipient } from "../api";

const MAX_LEN = 4000;

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; deliveredAt: string }
  | { kind: "error"; message: string };

interface Props {
  recipient: Recipient | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof SendError) {
    switch (err.status) {
      case 404:
        return "Recipient not found. Have they added the app?";
      case 502:
        return "Upstream Chat API call failed. Check ingress / credentials.";
      case 400:
        return `Bad request${err.detail ? `: ${err.detail}` : " (validation failed)."}`;
      default:
        return err.detail ?? "Send failed. Please try again.";
    }
  }
  return "Send failed. Please try again.";
}

export function Composer({ recipient }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const trimmed = text.trim();
  const remaining = MAX_LEN - text.length;
  const overLimit = text.length > MAX_LEN;
  const sending = status.kind === "sending";
  const canSend = !sending && !!recipient && trimmed.length > 0 && !overLimit;

  async function onSend() {
    if (!recipient || !canSend) return;
    setStatus({ kind: "sending" });
    try {
      const res = await send(recipient.key, trimmed);
      setStatus({ kind: "success", deliveredAt: res.deliveredAt });
      setText("");
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <section className="panel">
      <label htmlFor="message">Message</label>
      <textarea
        id="message"
        rows={5}
        value={text}
        placeholder="Type a message to deliver into Google Chat…"
        onChange={(e) => setText(e.target.value)}
      />

      <div className="composer-foot">
        <span className={overLimit ? "counter error" : "counter"}>
          {remaining} characters remaining
        </span>
        <button onClick={onSend} disabled={!canSend} className="btn-primary">
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {status.kind === "success" && (
        <p className="success">
          Delivered at {new Date(status.deliveredAt).toLocaleTimeString()}.
        </p>
      )}
      {status.kind === "error" && <p className="error">{status.message}</p>}
    </section>
  );
}
