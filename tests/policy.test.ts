import { describe, expect, it } from "vitest";
import { coveredEvidenceIds, decideTreatment } from "../lib/policy";
import { withoutRepeats, type EvidenceRecord } from "../lib/store";

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
  it("a never-seen listing gets an observation-only caveat on the unknown path", () => {
    const still = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-09-20", cashDate: "2026-10-11", listing: { status: "still_absent", checkedOn: "2026-10-11", searchedSince: "2026-09-11" }, reply: null });
    expect(still.outcome).toBe("unknown");
    expect(still.caveats).toContain("Crustdata on 2026-10-11 still finds no matching public listing for this role among listings added since 2026-09-11, and it hasn't been seen listed at any check. A listing that has never been seen is an observation only; it doesn't show this role is paused, cancelled or filled.");
    const first = decideTreatment({ stage: "interviewing", lastConfirmedAt: null, cashDate: "2026-10-11", listing: { status: "baseline_absent" }, reply: null });
    expect(first.caveats).toContain("Crustdata's first check found no matching public listing for this role, and there is no earlier listing history. A listing that has never been seen is an observation only; it doesn't show this role is paused, cancelled or filled.");
    expect(first.missing.join(" ")).not.toContain("listing");
    const gone = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-09-20", cashDate: "2026-10-11", listing: { status: "not_found", checkedOn: "2026-10-11", searchedSince: "2026-09-01" }, reply: null });
    expect(gone.caveats).toContain("Crustdata on 2026-10-11 found no matching public listing among listings added since 2026-09-01 after an earlier sighting. A missing listing is an observation only; it doesn't show this role is paused, cancelled or filled.");
  });

  it("a never-seen listing adds no caveat when a recent confirmation settles the role", () => {
    const r = decideTreatment({ stage: "final_interview", lastConfirmedAt: "2026-10-09", cashDate: "2026-10-11", listing: { status: "still_absent" }, reply: null });
    expect(r.outcome).toBe("unreviewed");
    expect(r.caveats.join(" ")).not.toContain("never been seen");
  });
});


describe("code-written coverage", () => {
  it("states the current openings count alongside a company-wide decline", () => {
    const r = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-09-01", cashDate: "2026-10-11", listing: { status: "not_checked" }, reply: null, companyTrend: { fromDate: "2026-06-01", fromJobs: 48, toDate: "2026-09-01", toJobs: 13, openingsCount: 9 } });
    expect(r.caveats.join(" ")).toContain("fell from 48 on 2026-06-01 to 13 on 2026-09-01 (9 openings reported when retrieved)");
    expect(r.coveredSources).toContain("company_snapshot");
  });

  it("leaves company hiring and incomplete checks to the model when no caveat describes them", () => {
    const r = decideTreatment({ stage: "interviewing", lastConfirmedAt: "2026-09-01", cashDate: "2026-10-11", listing: { status: "incomplete" }, reply: null, companyTrend: { fromDate: "2026-06-01", fromJobs: 10, toDate: "2026-09-01", toJobs: 15 } });
    expect(r.coveredSources).toEqual(["client_confirmation"]);
  });

  it("covers only the latest record of a described source, but every repeated remark", () => {
    const ev = [
      { id: "l1", sourceType: "listing_check" }, { id: "l2", sourceType: "listing_check" },
      { id: "c1", sourceType: "client_confirmation" }, { id: "u1", sourceType: "agency_update" }, { id: "u2", sourceType: "agency_update" }, { id: "s1", sourceType: "company_snapshot" },
    ];
    expect(coveredEvidenceIds(ev, ["client_confirmation", "listing_check", "agency_update"])).toEqual(["c1", "l2", "u1", "u2"]);
  });
});

describe("withoutRepeats", () => {
  const rec = (id: string, retrieved: string, summary: string, source_type = "listing_check"): EvidenceRecord => ({ id, agency_id: "a", client_id: "c", mandate_id: "m", source_type, provenance: "live", source_date: retrieved.slice(0, 10), retrieved_at: retrieved, summary, payload: "{}", complete: 1 });
  it("collapses identical checks whose search window moved, keeping the newest", () => {
    const out = withoutRepeats([
      rec("w1", "2026-10-11T07:00:00Z", "Crustdata's complete search still finds no listing matching \"X\" at Y added since 2026-09-11. The role hasn't been seen listed since the first check on 2026-10-04."),
      rec("w2", "2026-10-18T07:00:00Z", "Crustdata's complete search still finds no listing matching \"X\" at Y added since 2026-09-18. The role hasn't been seen listed since the first check on 2026-10-04."),
    ]);
    expect(out.map((e) => e.id)).toEqual(["w2"]);
  });
  it("keeps checks with different results", () => {
    const out = withoutRepeats([
      rec("f1", "2026-10-04T07:00:00Z", "Crustdata still lists \"X\" (added 2026-09-20)."),
      rec("n1", "2026-10-11T07:00:00Z", "Crustdata's complete search found no listing matching \"X\" at Y added since 2026-08-21. A missing listing is an observation, not a confirmed pause."),
    ]);
    expect(out.map((e) => e.id)).toEqual(["f1", "n1"]);
  });
});
