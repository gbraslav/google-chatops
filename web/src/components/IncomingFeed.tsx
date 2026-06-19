/**
 * Live inbound feed (requirements §5.4).
 *
 * Opens an SSE connection, shows a connection indicator, prepends each message,
 * and caps the list at the 50 most recent.
 */

import { useEffect, useState } from "react";
import { openIncoming, type IncomingMessage } from "../api";

const MAX_ITEMS = 50;

type Conn = "connecting" | "live";
type FeedItem = IncomingMessage & { id: number };

export function IncomingFeed() {
  const [messages, setMessages] = useState<FeedItem[]>([]);
  const [conn, setConn] = useState<Conn>("connecting");

  useEffect(() => {
    let nextId = 0;
    const es = openIncoming({
      onReady: () => setConn("live"),
      onMessage: (msg) => {
        setMessages((prev) => [{ ...msg, id: nextId++ }, ...prev].slice(0, MAX_ITEMS));
      },
      onError: () => setConn("connecting"),
    });
    return () => es.close();
  }, []);

  return (
    <section className="panel feed">
      <div className="panel-head">
        <h2>Live inbound feed</h2>
        <span className={conn === "live" ? "indicator live" : "indicator connecting"}>
          {conn === "live" ? "● live" : "○ connecting…"}
        </span>
      </div>

      {messages.length === 0 ? (
        <p className="empty">
          Nothing yet. Send the app a message in Chat and it will appear here.
        </p>
      ) : (
        <ul className="feed-list">
          {messages.map((m) => {
            const who = m.email ?? m.identifier ?? m.senderId;
            return (
              <li key={m.id} className="feed-item">
                <div className="feed-item-head">
                  <strong>{m.displayName ?? "Unknown"}</strong>
                  {who && <span className="who">{who}</span>}
                  <span className="time">
                    {new Date(m.receivedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="feed-item-text">{m.text}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
