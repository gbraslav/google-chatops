/**
 * Composer app shell (requirements §5).
 *
 * Owns the recipient list + selection so the selection is preserved across
 * refreshes (§5.1) and shared with the composer.
 */

import { useCallback, useEffect, useState } from "react";
import { getRecipients, type Recipient } from "./api";
import { RecipientPicker } from "./components/RecipientPicker";
import { Composer } from "./components/Composer";
import { IncomingFeed } from "./components/IncomingFeed";
import { SentCards } from "./components/SentCards";

export default function App() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a card is sent so the SentCards list reloads.
  const [cardsVersion, setCardsVersion] = useState(0);

  const loadRecipients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getRecipients();
      setRecipients(list);
      // §5.1: preserve current selection when it still exists; else default to first.
      setSelectedKey((prev) => {
        if (prev && list.some((r) => r.key === prev)) return prev;
        return list[0]?.key ?? null;
      });
    } catch {
      setError("Could not load recipients. Is the server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  const selected = recipients.find((r) => r.key === selectedKey) ?? null;

  return (
    <main className="app">
      <header>
        <h1>Google Chat Proactive Messenger</h1>
        <p className="sub">
          Send a message into Google Chat from the web, and watch replies stream back.
        </p>
      </header>

      <div className="columns">
        <div className="col">
          <RecipientPicker
            recipients={recipients}
            selectedKey={selectedKey}
            loading={loading}
            error={error}
            onSelect={setSelectedKey}
            onRefresh={() => void loadRecipients()}
          />
          <Composer recipient={selected} onCardSent={() => setCardsVersion((v) => v + 1)} />
          <SentCards version={cardsVersion} />
        </div>
        <div className="col">
          <IncomingFeed />
        </div>
      </div>
    </main>
  );
}
