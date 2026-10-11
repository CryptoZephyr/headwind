import type { Outcome } from "./scenarios";

export const STALE_CONFIRMATION_DAYS = 10;

export interface ListingObservation {
  status: "found" | "not_found" | "incomplete" | "not_checked" | "baseline_found" | "baseline_absent";
  evidenceId?: string;
}

export interface ReplyReading {
  outcome: "client_pause" | "placed_elsewhere" | "still_active" | "unclear";
  pausedUntil: string | null;
  replyId: string;
  replyDate?: string;
}

export interface CompanyTrend {
  fromDate: string;
  fromJobs: number;
  toDate: string;
  toJobs: number;
}

export interface PolicyInput {
  stage: string;
  lastConfirmedAt: string | null;
  cashDate: string;
  listing: ListingObservation;
  reply: ReplyReading | null;
  companyTrend?: CompanyTrend | null;
}

export interface PolicyResult {
  outcome: Outcome;
  needsTask: boolean;
  observation: string;
  considered: Outcome[];
  missing: string[];
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function decideTreatment(p: PolicyInput): PolicyResult {
  const considered: Outcome[] = ["offer_accepted", "client_pause", "placed_elsewhere", "unknown"];
  if (p.reply && p.reply.outcome !== "unclear") {
    if (p.reply.outcome === "client_pause") {
      return { outcome: "client_pause", needsTask: false, considered, missing: [], observation: p.reply.pausedUntil ? `Client confirmed a pause until ${p.reply.pausedUntil}.` : "Client confirmed a pause with no restart date." };
    }
    if (p.reply.outcome === "placed_elsewhere") {
      return { outcome: "placed_elsewhere", needsTask: false, considered, missing: [], observation: "Client confirmed the role was filled another way." };
    }
    const t = p.companyTrend;
    const confirmed = `Client confirmed${p.reply.replyDate ? ` on ${p.reply.replyDate}` : ""} that this role is still active.`;
    const observation = t && t.toJobs < t.fromJobs
      ? `${confirmed} Crustdata shows company-wide open roles fell from ${t.fromJobs} on ${t.fromDate} to ${t.toJobs} on ${t.toDate}. That count covers the whole company and says nothing about this role, so the dated confirmation for this role is used and the fee assumption is kept.`
      : confirmed;
    return { outcome: "unreviewed", needsTask: false, considered, missing: [], observation };
  }
  if (p.stage === "offer_accepted") {
    return { outcome: "offer_accepted", needsTask: false, considered, missing: [], observation: "Agency records show an accepted offer." };
  }
  const missing: string[] = [];
  const age = p.lastConfirmedAt ? daysBetween(p.lastConfirmedAt, p.cashDate) : null;
  if (age === null) missing.push("No record of when the client last confirmed this role.");
  else if (age > STALE_CONFIRMATION_DAYS) missing.push(`Client last confirmed this role ${age} days ago.`);
  if (p.listing.status === "not_found") missing.push("The role's public listing was not found in the latest complete check.");
  if (p.listing.status === "incomplete") missing.push("The latest listing check didn't finish, so it's unknown whether the role is still listed.");
  if (p.reply?.outcome === "unclear") missing.push("The client's reply didn't say whether the role is still active.");
  if (missing.length === 0) {
    return { outcome: "unreviewed", needsTask: false, considered, missing, observation: "Recent client confirmation and no conflicting evidence." };
  }
  return { outcome: "unknown", needsTask: true, considered, missing, observation: missing.join(" ") };
}
