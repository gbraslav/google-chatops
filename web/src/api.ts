/**
 * API client for the server (requirements §5.5).
 *
 * Base URL is configurable via VITE_API_BASE; defaults to same-origin.
 */

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export interface Recipient {
  key: string;
  displayName: string;
  email?: string;
  identifier?: string;
}

export interface IncomingMessage {
  displayName?: string;
  spaceName: string;
  senderId?: string;
  email?: string | null;
  identifier?: string;
  text: string;
  receivedAt: string;
}

export interface SendSuccess {
  ok: true;
  deliveredAt: string;
  recipientKey: string;
  /** Present when a card was sent; used to target updates. */
  messageId?: string;
}

/* ── Card contract (mirror of the server's CardSpec in validation.ts) ───────── */

export type CardStyle = "primary" | "danger" | "default";

export type ButtonSpec =
  | { kind: "link"; label: string; url: string; style?: CardStyle }
  | { kind: "action"; label: string; id: string; value?: string; style?: CardStyle };

export type WidgetSpec =
  | { type: "text"; content: string; style?: "bold" | "muted" }
  | { type: "image"; url: string; alt?: string }
  | { type: "divider" }
  | { type: "fields"; fields: { label: string; value: string }[] }
  | { type: "section"; children: WidgetSpec[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "actions"; buttons: ButtonSpec[] }
  | {
      type: "selection";
      id: string;
      label: string;
      kind: "dropdown" | "radio";
      options: { label: string; value: string }[];
      initialOption?: string;
    };

export interface CardSpec {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  children: WidgetSpec[];
}

export interface CardPreset {
  id: string;
  name: string;
  description: string;
  interactive?: boolean;
  spec: CardSpec;
}

export interface SentCard {
  messageId: string;
  recipientKey: string;
  title: string;
  spec: CardSpec;
  createdAt: string;
  updatedAt: string;
  /** False after a server restart — updates will 409 until resent. */
  live: boolean;
}

/** Thrown by send() so callers can branch on HTTP status (§5.3). */
export class SendError extends Error {
  constructor(
    public status: number,
    public detail?: string,
  ) {
    super(`Send failed with status ${status}`);
    this.name = "SendError";
  }
}

export async function getRecipients(): Promise<Recipient[]> {
  const res = await fetch(`${API_BASE}/api/recipients`);
  if (!res.ok) throw new Error(`Failed to load recipients (${res.status})`);
  return (await res.json()) as Recipient[];
}

export async function send(recipientKey: string, text: string): Promise<SendSuccess> {
  const res = await fetch(`${API_BASE}/api/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientKey, text }),
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = body?.error ?? body?.detail;
    } catch {
      /* ignore parse failure */
    }
    throw new SendError(res.status, detail);
  }
  return (await res.json()) as SendSuccess;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const b = await res.json();
      detail = b?.error ?? b?.detail;
    } catch {
      /* ignore parse failure */
    }
    throw new SendError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Send a card to a recipient. Returns the messageId so it can be updated later. */
export function sendCard(recipientKey: string, card: CardSpec): Promise<SendSuccess> {
  return postJson<SendSuccess>("/api/send", { recipientKey, card });
}

/** Update a previously-sent card in place. */
export function updateCard(
  messageId: string,
  card: CardSpec,
): Promise<{ ok: true; messageId: string; updatedAt: string }> {
  return postJson("/api/cards/update", { messageId, card });
}

/** The gallery's preset cards (single source of truth, served by the server). */
export async function getCardPresets(): Promise<CardPreset[]> {
  const res = await fetch(`${API_BASE}/api/card-presets`);
  if (!res.ok) throw new Error(`Failed to load presets (${res.status})`);
  return (await res.json()) as CardPreset[];
}

/**
 * Upload an image for the card image widget. Returns its served URL and whether
 * that URL is public (PUBLIC_BASE_URL set) — if not, it won't render in Chat.
 */
export async function uploadImage(file: File): Promise<{ url: string; public: boolean }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/uploads`, { method: "POST", body: form });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const b = await res.json();
      detail = b?.error ?? b?.detail;
    } catch {
      /* ignore */
    }
    throw new SendError(res.status, detail);
  }
  const body = (await res.json()) as { url: string; public: boolean };
  return body;
}

/** Previously-sent cards, newest first. */
export async function getSentCards(): Promise<SentCard[]> {
  const res = await fetch(`${API_BASE}/api/cards`);
  if (!res.ok) throw new Error(`Failed to load sent cards (${res.status})`);
  return (await res.json()) as SentCard[];
}

/** Open the SSE live feed. Returns the EventSource so the caller can close it. */
export function openIncoming(handlers: {
  onReady?: () => void;
  onMessage: (msg: IncomingMessage) => void;
  onError?: () => void;
}): EventSource {
  const es = new EventSource(`${API_BASE}/api/incoming`);
  es.addEventListener("ready", () => handlers.onReady?.());
  es.addEventListener("message", (e) => {
    try {
      handlers.onMessage(JSON.parse((e as MessageEvent).data) as IncomingMessage);
    } catch {
      /* ignore malformed event */
    }
  });
  es.onerror = () => handlers.onError?.();
  return es;
}
