/**
 * Card gallery — pick a preset showcase card (one per Google widget type, plus
 * the interactive counter / approve-reject), tweak its title/subtitle, and send.
 * Presets come from the server (GET /api/card-presets) so they stay in sync with
 * the interactive onAction handlers.
 */

import { useEffect, useMemo, useState } from "react";
import { getCardPresets, sendCard, type CardPreset, type CardSpec, type Recipient } from "../api";
import { errorMessage } from "../sendStatus";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; messageId?: string }
  | { kind: "error"; message: string };

interface Props {
  recipient: Recipient | null;
  onCardSent: () => void;
}

export function CardGallery({ recipient, onCardSent }: Props) {
  const [presets, setPresets] = useState<CardPreset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    getCardPresets()
      .then((list) => {
        setPresets(list);
        if (list[0]) selectPreset(list[0]);
      })
      .catch(() => setStatus({ kind: "error", message: "Could not load card presets." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => presets.find((p) => p.id === selectedId) ?? null,
    [presets, selectedId],
  );

  function selectPreset(p: CardPreset) {
    setSelectedId(p.id);
    setTitle(p.spec.title ?? "");
    setSubtitle(p.spec.subtitle ?? "");
    setStatus({ kind: "idle" });
  }

  const spec: CardSpec | null = selected
    ? { ...selected.spec, title: title || undefined, subtitle: subtitle || undefined }
    : null;

  const sending = status.kind === "sending";
  const canSend = !sending && !!recipient && !!spec;

  async function onSend() {
    if (!recipient || !spec) return;
    setStatus({ kind: "sending" });
    try {
      const res = await sendCard(recipient.key, spec);
      setStatus({ kind: "success", messageId: res.messageId });
      onCardSent();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <div className="card-tool">
      <label>Preset</label>
      <ul className="preset-list">
        {presets.map((p) => (
          <li key={p.id}>
            <button
              className={p.id === selectedId ? "preset active" : "preset"}
              onClick={() => selectPreset(p)}
            >
              <span className="preset-name">
                {p.name}
                {p.interactive && <span className="badge">interactive</span>}
              </span>
              <span className="preset-desc">{p.description}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <>
          <label htmlFor="card-title">Title</label>
          <input id="card-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="card-subtitle">Subtitle</label>
          <input
            id="card-subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />

          <details className="json-preview">
            <summary>CardSpec JSON</summary>
            <pre>{JSON.stringify(spec, null, 2)}</pre>
          </details>
        </>
      )}

      <div className="composer-foot">
        <span className="counter">{selected?.interactive ? "Click its buttons in Chat after sending." : ""}</span>
        <button onClick={onSend} disabled={!canSend} className="btn-primary">
          {sending ? "Sending…" : "Send card"}
        </button>
      </div>

      {status.kind === "success" && <p className="success">Card sent.</p>}
      {status.kind === "error" && <p className="error">{status.message}</p>}
    </div>
  );
}
