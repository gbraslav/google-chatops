/**
 * Composer (requirements §5.2, §5.3) + card modes.
 *
 * Mode toggle: Text · Card gallery · Card builder. Text keeps the original
 * proactive-send path; the card modes send a CardSpec and bubble up onCardSent
 * so the sent-cards list can refresh.
 */

import { useState } from "react";
import { send, type Recipient } from "../api";
import { errorMessage } from "../sendStatus";
import { CardGallery } from "./CardGallery";
import { CardBuilder } from "./CardBuilder";

const MAX_LEN = 4000;

type Mode = "text" | "gallery" | "builder";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; deliveredAt: string }
  | { kind: "error"; message: string };

interface Props {
  recipient: Recipient | null;
  onCardSent: () => void;
}

export function Composer({ recipient, onCardSent }: Props) {
  const [mode, setMode] = useState<Mode>("text");

  return (
    <section className="panel">
      <div className="mode-tabs" role="tablist" aria-label="Compose mode">
        <button
          role="tab"
          aria-selected={mode === "text"}
          className={mode === "text" ? "tab active" : "tab"}
          onClick={() => setMode("text")}
        >
          Text
        </button>
        <button
          role="tab"
          aria-selected={mode === "gallery"}
          className={mode === "gallery" ? "tab active" : "tab"}
          onClick={() => setMode("gallery")}
        >
          Card gallery
        </button>
        <button
          role="tab"
          aria-selected={mode === "builder"}
          className={mode === "builder" ? "tab active" : "tab"}
          onClick={() => setMode("builder")}
        >
          Card builder
        </button>
      </div>

      {mode === "text" && <TextComposer recipient={recipient} />}
      {mode === "gallery" && <CardGallery recipient={recipient} onCardSent={onCardSent} />}
      {mode === "builder" && <CardBuilder recipient={recipient} onCardSent={onCardSent} />}
    </section>
  );
}

function TextComposer({ recipient }: { recipient: Recipient | null }) {
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
    <>
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
        <p className="success">Delivered at {new Date(status.deliveredAt).toLocaleTimeString()}.</p>
      )}
      {status.kind === "error" && <p className="error">{status.message}</p>}
    </>
  );
}
