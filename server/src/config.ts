/**
 * Environment configuration + bootstrap flags (requirements §6.7, §10).
 *
 * Reads from process.env. Loaded once at startup. `credentialsConfigured`
 * mirrors how the gchat adapter auto-detects credentials, so the server can warn
 * on boot and so POST /api/send can return a clean 502 when app credentials are
 * absent (requirements §6.3).
 */

function bool(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

const credentialsConfigured =
  Boolean(process.env.GOOGLE_CHAT_CREDENTIALS) ||
  bool(process.env.GOOGLE_CHAT_USE_ADC) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

export const config = {
  port: Number(process.env.PORT ?? 3978),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:5173",
  dbPath: process.env.DB_PATH ?? "./data/spaces.db",

  projectNumber: process.env.GOOGLE_CHAT_PROJECT_NUMBER,
  endpointUrl: process.env.GCHAT_ENDPOINT_URL,
  allowInsecureEvents: bool(process.env.ALLOW_INSECURE_EVENTS),

  // Public base URL Google can reach for card image widgets (uploaded images are
  // served at `${publicBaseUrl}/api/uploads/:id`). Point a tunnel at this server's
  // port and set PUBLIC_BASE_URL to its https URL; falls back to the request origin
  // (localhost) for local builder preview only.
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",

  credentialsConfigured,
} as const;

export type Config = typeof config;
