import { describe, expect, it } from "vitest";
import { calculateScenarios, type AgencyInput, type MandateInput } from "../lib/scenarios";

const agency: AgencyInput = {
  horizonStart: "2026-11-01",
  horizonEnd: "2026-11-30",
  openingCashCents: 2_000_000,
  receivablesCents: 0,
  recruiterPayCents: 1_200_000,
  otherExpensesCents: 300_000,
};
const mandates: MandateInput[] = [
  { id: "M-101", feeCents: 1_000_000, probabilityBps: 8000, expectedTriggerDate: "2026-10-20", paymentTermsDays: 30 },
  { id: "M-102", feeCents: 1_000_000, probabilityBps: 5000, expectedTriggerDate: "2026-10-20", paymentTermsDays: 30 },
  { id: "M-103", feeCents: 1_000_000, probabilityBps: 4000, expectedTriggerDate: "2026-10-20", paymentTermsDays: 30 },
];

describe("worked fixture (page 04)", () => {
  const r = calculateScenarios(agency, mandates, [
    { mandateId: "M-101", outcome: "offer_accepted" },
    { mandateId: "M-102", outcome: "client_pause", pausedUntil: "2027-02-01" },
    { mandateId: "M-103", outcome: "unknown" },
  ]);
  it("Original 17,000 / 22,000", () => {
    expect(r.original.expectedReceiptsCents).toBe(1_700_000);
    expect(r.original.closingCashCents).toBe(2_200_000);
  });
  it("Reviewed 12,000 / 17,000", () => {
    expect(r.reviewed.expectedReceiptsCents).toBe(1_200_000);
    expect(r.reviewed.closingCashCents).toBe(1_700_000);
  });
  it("Downside 8,000 / 13,000", () => {
    expect(r.downside.expectedReceiptsCents).toBe(800_000);
    expect(r.downside.closingCashCents).toBe(1_300_000);
  });
  it("is idempotent: same inputs give same totals", () => {
    const again = calculateScenarios(agency, mandates, [
      { mandateId: "M-101", outcome: "offer_accepted" },
      { mandateId: "M-102", outcome: "client_pause", pausedUntil: "2027-02-01" },
      { mandateId: "M-103", outcome: "unknown" },
    ]);
    expect(again.reviewed.closingCashCents).toBe(r.reviewed.closingCashCents);
  });
});

describe("validation", () => {
  it("rejects probability over 100%", () => {
    expect(() => calculateScenarios(agency, [{ ...mandates[0], probabilityBps: 12000 }], [])).toThrow(/probability/);
  });
  it("excludes receipts collected after the horizon", () => {
    const r = calculateScenarios(agency, [{ ...mandates[0], expectedTriggerDate: "2026-11-20" }], []);
    expect(r.original.expectedReceiptsCents).toBe(0);
  });
});

describe("client pause that ends before the expected trigger", () => {
  it("keeps the fee on its original timing", () => {
    const r = calculateScenarios(agency, mandates, [{ mandateId: "M-102", outcome: "client_pause", pausedUntil: "2026-10-10" }]);
    const line = r.reviewed.lines.find((l) => l.mandateId === "M-102")!;
    expect(line.includedCents).toBe(500_000);
    expect(line.collectionDate).toBe("2026-11-19");
  });
});
