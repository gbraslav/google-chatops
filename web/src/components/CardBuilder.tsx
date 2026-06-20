/**
 * Freeform card builder — add/remove widgets to compose an arbitrary CardSpec,
 * preview the JSON, and send. Covers the common widget types; for `fields`,
 * `section` bodies, and `selection` options, multi-value inputs are entered one
 * per line as "label | value" (value optional where not needed).
 */

import { useMemo, useState, type ChangeEvent } from "react";
import { sendCard, uploadImage, type CardSpec, type Recipient, type WidgetSpec } from "../api";
import { errorMessage } from "../sendStatus";

type EditWidget =
  | { uid: number; type: "text"; content: string; style: "plain" | "bold" | "muted" }
  | { uid: number; type: "image"; url: string; alt: string }
  | { uid: number; type: "divider" }
  | { uid: number; type: "fields"; lines: string }
  | { uid: number; type: "section"; heading: string; body: string }
  | { uid: number; type: "link"; label: string; url: string }
  | { uid: number; type: "action"; label: string; id: string; value: string }
  | { uid: number; type: "selection"; id: string; label: string; kind: "dropdown" | "radio"; options: string };

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

interface Props {
  recipient: Recipient | null;
  onCardSent: () => void;
}

let nextUid = 1;

function blank(type: EditWidget["type"]): EditWidget {
  const uid = nextUid++;
  switch (type) {
    case "text":
      return { uid, type, content: "", style: "plain" };
    case "image":
      return { uid, type, url: "", alt: "" };
    case "divider":
      return { uid, type };
    case "fields":
      return { uid, type, lines: "Environment | production\nVersion | v2.4.0" };
    case "section":
      return { uid, type, heading: "Section", body: "First line\nSecond line" };
    case "link":
      return { uid, type, label: "Open", url: "https://example.com" };
    case "action":
      return { uid, type, label: "Increment", id: "counter:inc", value: "0" };
    case "selection":
      return { uid, type, id: "choice", label: "Pick one", kind: "dropdown", options: "Low | low\nHigh | high" };
  }
}

/** Parse "label | value" lines into pairs (value falls back to label). */
function parsePairs(text: string): { label: string; value: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split("|").map((s) => s.trim());
      const label = parts[0] ?? "";
      return { label, value: parts[1] || label };
    })
    .filter((p) => p.label.length > 0);
}

function toWidget(w: EditWidget): WidgetSpec | null {
  switch (w.type) {
    case "text":
      return w.content.trim()
        ? { type: "text", content: w.content, style: w.style === "plain" ? undefined : w.style }
        : null;
    case "image":
      return w.url.trim() ? { type: "image", url: w.url, alt: w.alt || undefined } : null;
    case "divider":
      return { type: "divider" };
    case "fields": {
      const fields = parsePairs(w.lines);
      return fields.length ? { type: "fields", fields } : null;
    }
    case "section": {
      const children: WidgetSpec[] = [];
      if (w.heading.trim()) children.push({ type: "text", content: w.heading, style: "bold" });
      for (const line of w.body.split("\n").map((l) => l.trim()).filter(Boolean)) {
        children.push({ type: "text", content: line });
      }
      return children.length ? { type: "section", children } : null;
    }
    case "link":
      return w.label.trim() && w.url.trim()
        ? { type: "actions", buttons: [{ kind: "link", label: w.label, url: w.url }] }
        : null;
    case "action":
      return w.label.trim() && w.id.trim()
        ? {
            type: "actions",
            buttons: [{ kind: "action", label: w.label, id: w.id, value: w.value || undefined }],
          }
        : null;
    case "selection": {
      const options = parsePairs(w.options);
      return w.id.trim() && options.length
        ? { type: "selection", id: w.id, label: w.label, kind: w.kind, options }
        : null;
    }
  }
}

const WIDGET_TYPES: EditWidget["type"][] = [
  "text",
  "image",
  "divider",
  "fields",
  "section",
  "link",
  "action",
  "selection",
];

export function CardBuilder({ recipient, onCardSent }: Props) {
  const [title, setTitle] = useState("My card");
  const [subtitle, setSubtitle] = useState("");
  const [widgets, setWidgets] = useState<EditWidget[]>([blank("text")]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function update(uid: number, patch: Partial<EditWidget>) {
    setWidgets((ws) => ws.map((w) => (w.uid === uid ? ({ ...w, ...patch } as EditWidget) : w)));
  }
  function remove(uid: number) {
    setWidgets((ws) => ws.filter((w) => w.uid !== uid));
  }
  function add(type: EditWidget["type"]) {
    setWidgets((ws) => [...ws, blank(type)]);
  }

  const spec: CardSpec = useMemo(() => {
    const children = widgets.map(toWidget).filter((w): w is WidgetSpec => w !== null);
    return { title: title || undefined, subtitle: subtitle || undefined, children };
  }, [widgets, title, subtitle]);

  const sending = status.kind === "sending";
  const canSend = !sending && !!recipient && spec.children.length > 0;

  async function onSend() {
    if (!recipient || !canSend) return;
    setStatus({ kind: "sending" });
    try {
      await sendCard(recipient.key, spec);
      setStatus({ kind: "success" });
      onCardSent();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <div className="card-tool">
      <label htmlFor="b-title">Title</label>
      <input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="b-subtitle">Subtitle</label>
      <input id="b-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />

      <label>Widgets</label>
      <ul className="builder-list">
        {widgets.map((w) => (
          <li key={w.uid} className="builder-widget">
            <div className="builder-widget-head">
              <strong>{w.type}</strong>
              <button className="btn-secondary" onClick={() => remove(w.uid)}>
                Remove
              </button>
            </div>
            <WidgetEditor w={w} update={update} />
          </li>
        ))}
      </ul>

      <div className="builder-add">
        {WIDGET_TYPES.map((t) => (
          <button key={t} className="btn-secondary" onClick={() => add(t)}>
            + {t}
          </button>
        ))}
      </div>

      <details className="json-preview">
        <summary>CardSpec JSON</summary>
        <pre>{JSON.stringify(spec, null, 2)}</pre>
      </details>

      <div className="composer-foot">
        <span className="counter">{spec.children.length} widget(s)</span>
        <button onClick={onSend} disabled={!canSend} className="btn-primary">
          {sending ? "Sending…" : "Send card"}
        </button>
      </div>

      {status.kind === "success" && <p className="success">Card sent.</p>}
      {status.kind === "error" && <p className="error">{status.message}</p>}
    </div>
  );
}

function WidgetEditor({
  w,
  update,
}: {
  w: EditWidget;
  update: (uid: number, patch: Partial<EditWidget>) => void;
}) {
  switch (w.type) {
    case "text":
      return (
        <div className="builder-fields">
          <textarea
            rows={2}
            value={w.content}
            placeholder="Text content"
            onChange={(e) => update(w.uid, { content: e.target.value })}
          />
          <select value={w.style} onChange={(e) => update(w.uid, { style: e.target.value as "plain" | "bold" | "muted" })}>
            <option value="plain">plain</option>
            <option value="bold">bold</option>
            <option value="muted">muted</option>
          </select>
        </div>
      );
    case "image":
      return <ImageWidgetEditor w={w} update={update} />;
    case "divider":
      return <p className="counter">No options.</p>;
    case "fields":
      return (
        <textarea
          rows={3}
          value={w.lines}
          placeholder={"One per line: label | value"}
          onChange={(e) => update(w.uid, { lines: e.target.value })}
        />
      );
    case "section":
      return (
        <div className="builder-fields">
          <input value={w.heading} placeholder="Heading (bold)" onChange={(e) => update(w.uid, { heading: e.target.value })} />
          <textarea
            rows={2}
            value={w.body}
            placeholder="Body lines (one per line)"
            onChange={(e) => update(w.uid, { body: e.target.value })}
          />
        </div>
      );
    case "link":
      return (
        <div className="builder-fields">
          <input value={w.label} placeholder="Button label" onChange={(e) => update(w.uid, { label: e.target.value })} />
          <input value={w.url} placeholder="URL" onChange={(e) => update(w.uid, { url: e.target.value })} />
        </div>
      );
    case "action":
      return (
        <div className="builder-fields">
          <input value={w.label} placeholder="Button label" onChange={(e) => update(w.uid, { label: e.target.value })} />
          <input value={w.id} placeholder="action id (e.g. counter:inc)" onChange={(e) => update(w.uid, { id: e.target.value })} />
          <input value={w.value} placeholder="value (optional)" onChange={(e) => update(w.uid, { value: e.target.value })} />
        </div>
      );
    case "selection":
      return (
        <div className="builder-fields">
          <input value={w.id} placeholder="id" onChange={(e) => update(w.uid, { id: e.target.value })} />
          <input value={w.label} placeholder="label" onChange={(e) => update(w.uid, { label: e.target.value })} />
          <select value={w.kind} onChange={(e) => update(w.uid, { kind: e.target.value as "dropdown" | "radio" })}>
            <option value="dropdown">dropdown</option>
            <option value="radio">radio</option>
          </select>
          <textarea
            rows={2}
            value={w.options}
            placeholder={"Options, one per line: label | value"}
            onChange={(e) => update(w.uid, { options: e.target.value })}
          />
        </div>
      );
  }
}

type ImageStatus =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "preview-only" }
  | { kind: "error"; message: string };

function ImageWidgetEditor({
  w,
  update,
}: {
  w: Extract<EditWidget, { type: "image" }>;
  update: (uid: number, patch: Partial<EditWidget>) => void;
}) {
  const [status, setStatus] = useState<ImageStatus>({ kind: "idle" });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: "uploading" });
    try {
      const { url, public: isPublic } = await uploadImage(file);
      update(w.uid, { url });
      setStatus(isPublic ? { kind: "idle" } : { kind: "preview-only" });
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      e.target.value = ""; // allow re-selecting the same file
    }
  }

  return (
    <div className="builder-fields">
      <input value={w.url} placeholder="Image URL (or upload below)" onChange={(e) => update(w.uid, { url: e.target.value })} />
      <input value={w.alt} placeholder="Alt text" onChange={(e) => update(w.uid, { alt: e.target.value })} />
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={onFile} />
      {status.kind === "uploading" && <p className="counter">Uploading…</p>}
      {status.kind === "preview-only" && (
        <p className="counter">
          Uploaded — but PUBLIC_BASE_URL is unset, so this renders here only, not in Chat.
        </p>
      )}
      {status.kind === "error" && <p className="error">{status.message}</p>}
      {w.url && <img src={w.url} alt={w.alt || "preview"} className="img-preview" />}
    </div>
  );
}
