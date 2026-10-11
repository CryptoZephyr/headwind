import { describe, expect, it } from "vitest";
import { containsUnsupportedClaim, questionRaisesUnsupportedOutcome, withRequiredFacts } from "../lib/llm";

describe("containsUnsupportedClaim", () => {
  it("rejects a plain outcome claim", () => {
    expect(containsUnsupportedClaim("The role was paused last week.", false)).toBe(true);
  });

  it("rejects frozen without hedge", () => {
    expect(containsUnsupportedClaim("It appears the role is frozen.", false)).toBe(true);
  });

  it("passes when sentence hedges the outcome word", () => {
    expect(containsUnsupportedClaim("It does not confirm whether the role was paused.", false)).toBe(false);
  });

  it("passes an observation sentence that repeats evidence text", () => {
    expect(containsUnsupportedClaim("A missing listing is an observation, not a confirmed pause.", false)).toBe(false);
  });

  it("passes 'may have been cancelled' as hedged", () => {
    expect(containsUnsupportedClaim("The role may have been cancelled.", false)).toBe(false);
  });

  it("passes 'unclear if filled'", () => {
    expect(containsUnsupportedClaim("It is unclear if the role was filled.", false)).toBe(false);
  });

  it("passes text with no outcome words", () => {
    expect(containsUnsupportedClaim("Client last confirmed 15 days ago.", false)).toBe(false);
  });

  it("exemption: agency-supplied evidence carrying outcome words passes even without hedge", () => {
    expect(containsUnsupportedClaim("The role was paused by the client.", true)).toBe(false);
  });

  it("passes when 'no' negates the outcome word", () => {
    expect(containsUnsupportedClaim("There is no evidence the role was cancelled.", false)).toBe(false);
  });

  it("rejects cancelled in second sentence when first sentence is fine", () => {
    expect(containsUnsupportedClaim("Client confirmed the role. The search was cancelled.", false)).toBe(true);
  });

  it.each([
    "The role was paused, not cancelled.",
    "The role is no longer open and the client could not confirm a new date.",
    "Hiring is frozen company-wide, which confirms this role is on hold.",
    "The role was possibly delayed; it was cancelled last week.",
    "Unconfirmed reports aside, the role is filled.",
    "The client could not confirm the date and the role is on hold.",
    "The evidence shows the role was cancelled.",
    "It is unclear whether the role was paused, but it was cancelled last week.",
    "Not confirmed, the role was cancelled.",
    "The listing was not found in the latest complete check, indicating it may no longer be active.",
    "The company-wide decline suggests the role may be on hold.",
    "The role may be paused, definitely cancelled.",
    "The role may be paused, the client cancelled it.",
  ])("rejects a separate assertion that a hedge elsewhere doesn't cover: %s", (text) => {
    expect(containsUnsupportedClaim(text, false)).toBe(true);
  });

  it.each([
    "The listing was not found; this is an observation, not proof of a pause.",
    "It is unclear whether the role is still open.",
    "The client may have filled the role elsewhere, so we should confirm.",
    "The role may be on hold or cancelled.",
    "There is no evidence, so far, that the role was cancelled.",
    "It is unclear whether the role was paused, cancelled or filled.",
    "The missing listing does not indicate that the role was cancelled.",
    "Nothing suggests whether the role was paused.",
    "There is insufficient evidence that the role was cancelled.",
    "These observations never prove, indicate, or suggest that the role was paused.",
    "The role may be paused, cancelled, or filled.",
  ])("passes a hedged sentence: %s", (text) => {
    expect(containsUnsupportedClaim(text, false)).toBe(false);
  });
});

describe("withRequiredFacts", () => {
  it("appends required facts the model left out, once", () => {
    const note = { summary: "Needs confirming.", question: "Still open?", evidence_ids: ["e1"] };
    const facts = ["Client last confirmed this role on 2026-08-31, 41 days before the 2026-10-11 review."];
    const out = withRequiredFacts(note, facts);
    expect(out.summary).toBe(`Needs confirming. ${facts[0]}`);
    expect(withRequiredFacts(out, facts).summary).toBe(out.summary);
  });
});

describe("questionRaisesUnsupportedOutcome", () => {
  it("rejects a question that names an outcome no agency record mentions", () => {
    expect(questionRaisesUnsupportedOutcome("Has the role been paused, cancelled or filled?", "Client record: last confirmed on 2026-09-08.")).toBe(true);
  });
  it("passes a neutral status question", () => {
    expect(questionRaisesUnsupportedOutcome("Is the role still open, and is the start date still 2026-11-01?", "")).toBe(false);
  });
  it("passes a question about an outcome an agency record raised", () => {
    expect(questionRaisesUnsupportedOutcome("You said the role is not cancelled; is it still going ahead this quarter?", "the hiring manager said the role is 'not cancelled, approvals are just slower'")).toBe(false);
  });
  it("doesn't treat a reported slowdown as backing a freeze question", () => {
    expect(questionRaisesUnsupportedOutcome("Has the role been frozen?", "Recruiter note: hiring is probably slowing down, nothing decided yet.")).toBe(true);
  });
  it("ignores outcome words inside the role title", () => {
    expect(questionRaisesUnsupportedOutcome("Is the Closed Loop Engineer role still open?", "Two candidates interviewing.", "Closed Loop Engineer")).toBe(false);
    expect(questionRaisesUnsupportedOutcome("Has the Closed Loop Engineer role been filled?", "Two candidates interviewing.", "Closed Loop Engineer")).toBe(true);
  });
});
