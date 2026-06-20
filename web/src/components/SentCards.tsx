/**
 * Sent cards — lists cards previously sent from the web app (GET /api/cards),
 * lets you pick one, edit its CardSpec (quick title/subtitle inputs + raw JSON),
 * and update it in place (POST /api/cards/update → SentMessage.edit). This is the
 * web-driven update demo; it works regardless of inbound-event health.
 *
 * `version` bumps when a card is sent elsewhere, triggering a reload.
 */

import { useCallback, useEffect, useState } from "react";
import { getSentCards, updateCard, type CardSpec, type SentCard } from "../api";
import { errorMessage } from "../sendStatus";

type Status =
  | { kind: "idle" }
  | { kind: "updating" }
  | { kind: "success" }
  | { kind: "error"; message: string };

interface Props {
  version: number;
}

export function SentCards({ version }: Props) {
  const [cards, setCards] = useState<SentCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const load = useCallback(async () => {
    try {
      const list = await getSentCards();
      setCards(list);
      setSelectedId((prev) => (prev && list.some((c) => c.messageId === prev) ? prev : list[0]?.messageId ?? null));
    } catch {
      setStatus({ kind: "error", message: "Could not load sent cards." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const selected = cards.find((c) => c.messageId === selectedId) ?? null;

  // Seed the editor when the selected card changes.
  useEffect(() => {
    if (selected) setJsonText(JSON.stringify(selected.spec, null, 2));
    setStatus({ kind: "idle" });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function parseSpec(): CardSpec | null {
    try {
      const obj = JSON.parse(jsonText);
      if (!obj || typeof obj !== "object" || !Array.isArray(obj.children)) return null;
      return obj as CardSpec;
    } catch {
      return null;
    }
  }

  function patchField(field: "title" | "subtitle", value: string) {
    const spec = parseSpec();
    if (!spec) return;
    const next = { ...spec, [field]: value || undefined };
    setJsonText(JSON.stringify(next, null, 2));
  }

  const draft = parseSpec();
  const updating = status.kind === "updating";
  const canUpdate = !updating && !!selected && !!draft;

  async function onUpdate() {
    if (!selected || !draft) return;
    setStatus({ kind: "updating" });
    try {
      await updateCard(selected.messageId, draft);
      setStatus({ kind: "success" });
      await load();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sent cards</h2>
        <button className="btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="empty">No cards sent yet. Send one from the gallery or builder.</p>
      ) : (
        <>
          <label htmlFor="sent-pick">Card</label>
          <select id="sent-pick" value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
            {cards.map((c) => (
              <option key={c.messageId} value={c.messageId}>
                {c.title} — {new Date(c.createdAt).toLocaleTimeString()}
                {c.live ? "" : " (expired)"}
              </option>
            ))}
          </select>

          {selected && !selected.live && (
            <p className="error">
              This card's handle was lost on a server restart — updates will fail until you resend it.
            </p>
          )}

          {draft && (
            <>
              <label htmlFor="sent-title">Title</label>
              <input
                id="sent-title"
                value={draft.title ?? ""}
                onChange={(e) => patchField("title", e.target.value)}
              />
              <label htmlFor="sent-subtitle">Subtitle</label>
              <input
                id="sent-subtitle"
                value={draft.subtitle ?? ""}
                onChange={(e) => patchField("subtitle", e.target.value)}
              />
            </>
          )}

          <label htmlFor="sent-json">CardSpec JSON</label>
          <textarea
            id="sent-json"
            rows={10}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          {!draft && <p className="error">Invalid CardSpec JSON.</p>}

          <div className="composer-foot">
            <span className="counter">Edits the message in place.</span>
            <button onClick={onUpdate} disabled={!canUpdate} className="btn-primary">
              {updating ? "Updating…" : "Update card"}
            </button>
          </div>

          {status.kind === "success" && <p className="success">Card updated.</p>}
          {status.kind === "error" && <p className="error">{status.message}</p>}
        </>
      )}
    </section>
  );
}
