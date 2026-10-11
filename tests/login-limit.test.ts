import { describe, expect, it } from "vitest";
import { publicUrl } from "../lib/auth";
import { clearFailures, isLockedOut, recordFailure } from "../lib/login-limit";

describe("login attempt limit", () => {
  it("locks a client out after five wrong passwords for 15 minutes", () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) recordFailure("a", t);
    expect(isLockedOut("a", t)).toBe(false);
    recordFailure("a", t);
    expect(isLockedOut("a", t)).toBe(true);
    expect(isLockedOut("b", t)).toBe(false);
    expect(isLockedOut("a", t + 15 * 60 * 1000)).toBe(false);
  });

  it("clears the count after a successful sign-in", () => {
    for (let i = 0; i < 5; i++) recordFailure("c");
    clearFailures("c");
    expect(isLockedOut("c")).toBe(false);
  });
});

describe("publicUrl", () => {
  it("uses the forwarded host and scheme from the HTTPS proxy", () => {
    const req = new Request("http://localhost:3000/api/login", { headers: { host: "localhost:3000", "x-forwarded-host": "headwind.example", "x-forwarded-proto": "https" } });
    expect(publicUrl(req, "/login").href).toBe("https://headwind.example/login");
  });
});
