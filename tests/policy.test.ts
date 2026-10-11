import { describe, expect, it } from "vitest";
import { decideTreatment } from "../lib/policy";

describe("decideTreatment", () => {
  it("asks for confirmation when the listing check didn't finish, even with a recent confirmation", () => {
    const r = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-10-05", cashDate: "2026-10-10", listing: { status: "incomplete" }, reply: null });
    expect(r.outcome).toBe("unknown");
    expect(r.needsTask).toBe(true);
  });

  const decline = { fromDate: "2026-07-01", fromJobs: 41, toDate: "2026-10-01", toJobs: 2 };

  it("stale confirmation with a live listing: follow-up under the 10-day limit, age stated, no pause inferred", () => {
    const r = decideTreatment({ stage: "final_interview", lastConfirmedAt: "2026-08-31", cashDate: "2026-10-11", listing: { status: "found", checkedOn: "2026-10-11" }, reply: null });
    expect(r.outcome).toBe("unknown");
    expect(r.needsTask).toBe(true);
    expect(r.caveats[0]).toBe("Client last confirmed this role on 2026-08-31, 41 days before the 2026-10-11 review. That is older than the 10-day freshness limit, so it needs reconfirming; its age alone doesn't show the role is paused.");
    expect(r.caveats.join(" ")).toContain("doesn't confirm the agency's mandate");
  });

  it("first listing sighting with stale confirmation says 'currently lists', not 'still lists'", () => {
    const r = decideTreatment({ stage: "final_interview", lastConfirmedAt: "2026-08-31", cashDate: "2026-10-11", listing: { status: "baseline_found", checkedOn: "2026-10-11" }, reply: null });
    const c = r.caveats.join(" ");
    expect(c).toContain("currently lists a matching public role (first check, no earlier sighting)");
    expect(c).not.toContain("still lists");
  });

  it("fresh role confirmation against a company-wide decline: both sources and dates, why, and what's unresolved", () => {
    const r = decideTreatment({ stage: "final_interview", lastConfirmedAt: "2026-10-09", cashDate: "2026-10-11", listing: { status: "baseline_absent" }, reply: null, companyTrend: decline });
    expect(r.outcome).toBe("unreviewed");
    expect(r.needsTask).toBe(false);
    const c = r.caveats.join(" ");
    expect(c).toContain("fell from 41 on 2026-07-01 to 2 on 2026-10-01");
    expect(c).toContain("client confirmed this role on 2026-10-09");
    expect(c).toContain("dated confirmation for this role is used");
    expect(c).toContain("Unresolved:");
    expect(r.observation).toContain(c);
  });

  it("stale confirmation against a company-wide decline: neither settles the role", () => {
    const r = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-09-08", cashDate: "2026-10-11", listing: { status: "not_found" }, reply: null, companyTrend: decline });
    expect(r.outcome).toBe("unknown");
    expect(r.caveats.join(" ")).toContain("Neither settles this role");
    expect(r.caveats.join(" ")).toContain("Unresolved: whether this role is still open.");
    expect(r.caveats.join(" ")).toContain("not evidence about this one");
    expect(r.caveats.join(" ")).toContain("A missing listing is an observation only");
  });

  it("unclear reply and reported remarks become caveats on the unknown path, without changing the treatment", () => {
    const r = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-10-09", cashDate: "2026-10-11", listing: { status: "baseline_absent" }, reply: { outcome: "unclear", pausedUntil: null, replyId: "r1", replyDate: "2026-10-09" }, remarks: [{ date: "2026-10-07", text: "Recruiter note: hiring is 'probably slowing down, nothing decided yet'." }] });
    expect(r.outcome).toBe("unknown");
    const c = r.caveats.join(" ");
    expect(c).toContain("The client's reply on 2026-10-09 doesn't say whether this role is still active");
    expect(c).toContain("Reported remark (2026-10-07), repeated as said and not a dated client confirmation of this role's status: Recruiter note: hiring is 'probably slowing down, nothing decided yet'.");
  });

  it("reported remarks don't add caveats when a recent confirmation settles the role", () => {
    const r = decideTreatment({ stage: "final_interview", lastConfirmedAt: "2026-10-09", cashDate: "2026-10-11", listing: { status: "baseline_absent" }, reply: null, remarks: [{ date: "2026-10-08", text: "Recruiter note: all good." }] });
    expect(r.outcome).toBe("unreviewed");
    expect(r.caveats.join(" ")).not.toContain("Reported remark");
  });
});
