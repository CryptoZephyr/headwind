import { describe, expect, it } from "vitest";
import { containsUnsupportedClaim } from "../lib/llm";

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
});
