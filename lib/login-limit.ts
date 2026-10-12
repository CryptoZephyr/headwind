import type Database from "better-sqlite3";
import { fromTrustedProxy, PROXY_HEADERS } from "./auth";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function isLockedOut(db: Database.Database, key: string, now = Date.now()): boolean {
  db.prepare("DELETE FROM login_failure WHERE failed_at <= ?").run(now - WINDOW_MS);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM login_failure WHERE client_key = ? AND failed_at > ?").get(key, now - WINDOW_MS) as { n: number };
  return n >= MAX_FAILURES;
}

export function recordFailure(db: Database.Database, key: string, now = Date.now()): void {
  db.prepare("INSERT INTO login_failure (client_key, failed_at) VALUES (?, ?)").run(key, now);
}

export function clearFailures(db: Database.Database, key: string): void {
  db.prepare("DELETE FROM login_failure WHERE client_key = ?").run(key);
}

export function clientKey(req: Request): string {
  if (fromTrustedProxy(req)) return `proxy:${req.headers.get(PROXY_HEADERS.client) ?? "unknown"}`;
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
}
