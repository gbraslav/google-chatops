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
