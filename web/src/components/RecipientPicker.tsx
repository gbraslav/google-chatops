/**
 * Recipient dropdown (requirements §5.1).
 *
 * Presentational: App owns the list/selection so it can preserve the selection
 * across refreshes and default to the first entry.
 */

import type { Recipient } from "../api";

interface Props {
  recipients: Recipient[];
  selectedKey: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (key: string) => void;
  onRefresh: () => void;
}

function label(r: Recipient): string {
  return r.email ? `${r.displayName} — ${r.email}` : r.displayName;
}

export function RecipientPicker({
  recipients,
  selectedKey,
  loading,
  error,
  onSelect,
  onRefresh,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <label htmlFor="recipient">Recipient</label>
        <button onClick={onRefresh} disabled={loading} className="btn-secondary">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {!error && recipients.length === 0 && !loading && (
        <p className="empty">
          No one has added the app yet. Add it in Google Chat and send it a message
          to register.
        </p>
      )}

      {recipients.length > 0 && (
        <select
          id="recipient"
          value={selectedKey ?? ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          {recipients.map((r) => (
            <option key={r.key} value={r.key}>
              {label(r)}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
