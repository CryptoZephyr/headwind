export type Cents = number;

export type Outcome = "unreviewed" | "offer_accepted" | "client_pause" | "placed_elsewhere" | "unknown";

export interface MandateInput {
  id: string;
  feeCents: Cents;
  probabilityBps: number;
  expectedTriggerDate: string;
  paymentTermsDays: number;
}

export interface AgencyInput {
  horizonStart: string;
  horizonEnd: string;
  openingCashCents: Cents;
  receivablesCents: Cents;
  recruiterPayCents: Cents;
  otherExpensesCents: Cents;
}

export interface MandateTreatment {
  mandateId: string;
  outcome: Outcome;
  pausedUntil?: string | null;
}

export interface ScenarioLine {
  mandateId: string;
  expectedFeeCents: Cents;
  collectionDate: string;
  inHorizon: boolean;
  includedCents: Cents;
  reason: string;
}

export interface ScenarioResult {
  name: "Original" | "Reviewed" | "Downside";
  lines: ScenarioLine[];
  expectedReceiptsCents: Cents;
  closingCashCents: Cents;
}

export function expectedFeeCents(m: MandateInput): Cents {
  if (!Number.isInteger(m.feeCents) || m.feeCents < 0) throw new Error(`Mandate ${m.id}: fee must be a non-negative whole number of cents`);
  if (!Number.isInteger(m.probabilityBps) || m.probabilityBps < 0 || m.probabilityBps > 10000) {
    throw new Error(`Mandate ${m.id}: probability must be between 0% and 100%`);
  }
  return Math.round((m.feeCents * m.probabilityBps) / 10000);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${isoDate}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inHorizon(date: string, a: AgencyInput): boolean {
  return date >= a.horizonStart && date <= a.horizonEnd;
}

function line(m: MandateInput, a: AgencyInput, include: boolean, reason: string, triggerDate = m.expectedTriggerDate): ScenarioLine {
  const fee = expectedFeeCents(m);
  const collectionDate = addDays(triggerDate, m.paymentTermsDays);
  const within = inHorizon(collectionDate, a);
  return { mandateId: m.id, expectedFeeCents: fee, collectionDate, inHorizon: within, includedCents: include && within ? fee : 0, reason };
}

function total(name: ScenarioResult["name"], lines: ScenarioLine[], a: AgencyInput): ScenarioResult {
  const expectedReceiptsCents = a.receivablesCents + lines.reduce((s, l) => s + l.includedCents, 0);
  const closingCashCents = a.openingCashCents + expectedReceiptsCents - a.recruiterPayCents - a.otherExpensesCents;
  return { name, lines, expectedReceiptsCents, closingCashCents };
}

export function calculateScenarios(agency: AgencyInput, mandates: MandateInput[], treatments: MandateTreatment[]) {
  const byId = new Map(treatments.map((t) => [t.mandateId, t]));
  const original = total("Original", mandates.map((m) => line(m, agency, true, "Imported assumption")), agency);

  const reviewedLines: ScenarioLine[] = [];
  const downsideLines: ScenarioLine[] = [];
  for (const m of mandates) {
    const t = byId.get(m.id)?.outcome ?? "unreviewed";
    if (t === "client_pause") {
      const until = byId.get(m.id)?.pausedUntil;
      const shifted = until && until > m.expectedTriggerDate ? until : null;
      const l = shifted
        ? line(m, agency, true, `Client confirmed pause; trigger moved to ${shifted}`, shifted)
        : { ...line(m, agency, false, "Client confirmed pause with no restart date"), includedCents: 0 };
      reviewedLines.push(l);
      downsideLines.push(l);
    } else if (t === "placed_elsewhere") {
      const l = { ...line(m, agency, false, "Client confirmed placement by someone else"), includedCents: 0 };
      reviewedLines.push(l);
      downsideLines.push(l);
    } else if (t === "unknown") {
      reviewedLines.push(line(m, agency, true, "Unresolved: disclosed assumption kept"));
      downsideLines.push({ ...line(m, agency, false, "Unresolved: excluded in downside"), includedCents: 0 });
    } else {
      const reason = t === "offer_accepted" ? "Accepted offer: owner probability and timing kept" : "No change";
      const l = line(m, agency, true, reason);
      reviewedLines.push(l);
      downsideLines.push(l);
    }
  }
  return {
    original,
    reviewed: total("Reviewed", reviewedLines, agency),
    downside: total("Downside", downsideLines, agency),
  };
}
