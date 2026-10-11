import { describe, expect, it } from "vitest";
import { decideTreatment } from "../lib/policy";

describe("decideTreatment", () => {
  it("asks for confirmation when the listing check didn't finish, even with a recent confirmation", () => {
    const r = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-10-05", cashDate: "2026-10-10", listing: { status: "incomplete" }, reply: null });
    expect(r.outcome).toBe("unknown");
    expect(r.needsTask).toBe(true);
  });
});
