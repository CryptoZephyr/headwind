import fs from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { publicUrl } from "../lib/auth";
import { migrate } from "../lib/db";
import { clearFailures, clientKey, isLockedOut, recordFailure } from "../lib/login-limit";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("login attempt limit", () => {
  it("locks a client out after five wrong passwords for 15 minutes", () => {
    const db = freshDb();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) recordFailure(db, "a", t);
    expect(isLockedOut(db, "a", t)).toBe(false);
    recordFailure(db, "a", t);
    expect(isLockedOut(db, "a", t)).toBe(true);
    expect(isLockedOut(db, "b", t)).toBe(false);
    expect(isLockedOut(db, "a", t + 15 * 60 * 1000)).toBe(false);
  });

  it("clears the count after a successful sign-in", () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) recordFailure(db, "c");
    clearFailures(db, "c");
    expect(isLockedOut(db, "c")).toBe(false);
  });

  it("keeps the lockout across an app restart", () => {
    const file = `/tmp/headwind-login-${process.pid}.db`;
    fs.rmSync(file, { force: true });
    const first = new Database(file);
    migrate(first);
    for (let i = 0; i < 5; i++) recordFailure(first, "d");
    first.close();
    const second = new Database(file);
    expect(isLockedOut(second, "d")).toBe(true);
    second.close();
    fs.rmSync(file, { force: true });
  });

  it("keys on the address the proxy appended, not one the caller supplied", () => {
    const req = new Request("http://localhost:3000/api/login", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" } });
    expect(clientKey(req)).toBe("203.0.113.9");
  });
});

describe("publicUrl", () => {
  it("uses the forwarded host and scheme from the HTTPS proxy", () => {
    const req = new Request("http://localhost:3000/api/login", { headers: { host: "localhost:3000", "x-forwarded-host": "headwind.example", "x-forwarded-proto": "https" } });
    expect(publicUrl(req, "/login").href).toBe("https://headwind.example/login");
  });
});
