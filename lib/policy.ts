import type { Outcome } from "./scenarios";

export const STALE_CONFIRMATION_DAYS = 10;

export interface ListingObservation {
  status: "found" | "not_found" | "incomplete" | "not_checked" | "baseline_found" | "baseline_absent" | "still_absent";
  evidenceId?: string;
  checkedOn?: string;
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
  remarks?: AgencyRemark[];
}

export interface AgencyRemark {
  date: string | null;
  text: string;
}

export interface PolicyResult {
  outcome: Outcome;
  needsTask: boolean;
  observation: string;
  considered: Outcome[];
  missing: string[];
  caveats: string[];
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function confirmationCaveat(p: PolicyInput): string {
  if (!p.lastConfirmedAt) return "No record of when the client last confirmed this role.";
  const age = daysBetween(p.lastConfirmedAt, p.cashDate);
  const base = `Client last confirmed this role on ${p.lastConfirmedAt}, ${age} day${age === 1 ? "" : "s"} before the ${p.cashDate} review`;
  return age > STALE_CONFIRMATION_DAYS
    ? `${base}. That is older than the ${STALE_CONFIRMATION_DAYS}-day freshness limit, so it needs reconfirming; its age alone doesn't show the role is paused.`
    : `${base}, within the ${STALE_CONFIRMATION_DAYS}-day freshness limit.`;
}

function declined(t: CompanyTrend | null | undefined): t is CompanyTrend {
  return Boolean(t && t.toJobs < t.fromJobs);
}

function companyDecline(t: CompanyTrend): string {
  return `Crustdata shows company-wide open roles fell from ${t.fromJobs} on ${t.fromDate} to ${t.toJobs} on ${t.toDate}`;
}

export function decideTreatment(p: PolicyInput): PolicyResult {
  const considered: Outcome[] = ["offer_accepted", "client_pause", "placed_elsewhere", "unknown"];
  const t = p.companyTrend;
  if (p.reply && p.reply.outcome !== "unclear") {
    if (p.reply.outcome === "client_pause") {
      return { outcome: "client_pause", needsTask: false, considered, missing: [], caveats: [], observation: p.reply.pausedUntil ? `Client confirmed a pause until ${p.reply.pausedUntil}.` : "Client confirmed a pause with no restart date." };
    }
    if (p.reply.outcome === "placed_elsewhere") {
      return { outcome: "placed_elsewhere", needsTask: false, considered, missing: [], caveats: [], observation: "Client confirmed the role was filled another way." };
    }
    const confirmed = `Client confirmed${p.reply.replyDate ? ` on ${p.reply.replyDate}` : ""} that this role is still active.`;
    const caveats = declined(t)
      ? [`Conflicting evidence: ${companyDecline(t)}, while the client's reply${p.reply.replyDate ? ` dated ${p.reply.replyDate}` : ""} says this role is still active. The reply is about this role and is dated; the company count covers every role at the company and says nothing about this one, so the dated confirmation for this role is used and the fee assumption is kept. Unresolved: whether the company-wide decline will later reach this role, which the next confirmation should check.`]
      : [];
    return { outcome: "unreviewed", needsTask: false, considered, missing: [], caveats, observation: [confirmed, ...caveats].join(" ") };
  }
  if (p.stage === "offer_accepted") {
    return { outcome: "offer_accepted", needsTask: false, considered, missing: [], caveats: [], observation: "Agency records show an accepted offer." };
  }
  const missing: string[] = [];
  const age = p.lastConfirmedAt ? daysBetween(p.lastConfirmedAt, p.cashDate) : null;
  const stale = age === null || age > STALE_CONFIRMATION_DAYS;
  if (age === null) missing.push("No record of when the client last confirmed this role.");
  else if (stale) missing.push(`Client last confirmed this role ${age} days ago.`);
  if (p.listing.status === "not_found") missing.push("The role's public listing was not found in the latest complete check.");
  if (p.listing.status === "incomplete") missing.push("The latest listing check didn't finish, so it's unknown whether the role is still listed.");
  if (p.reply?.outcome === "unclear") missing.push("The client's reply didn't say whether the role is still active.");
  const caveats = [confirmationCaveat(p)];
  if (declined(t)) {
    caveats.push(stale
      ? `Conflicting evidence. Neither settles this role: ${companyDecline(t)}, a count that covers every role at the company and is not evidence about this one; ${p.lastConfirmedAt ? `the client's last confirmation for this role is from ${p.lastConfirmedAt}, too old to rely on` : "there is no dated client confirmation for this role"}. Unresolved: whether this role is still open.`
      : `Conflicting evidence: ${companyDecline(t)}, while the client confirmed this role on ${p.lastConfirmedAt}. The confirmation is about this role and is dated; the company count covers every role at the company and says nothing about this one, so the dated confirmation for this role is used rather than the company count. Unresolved: whether the company-wide decline will later reach this role, which the next confirmation should check.`);
  }
  if (p.listing.status === "not_found") caveats.push(`Crustdata ${p.listing.checkedOn ? `on ${p.listing.checkedOn} ` : ""}found no matching public listing after an earlier sighting. A missing listing is an observation only; it doesn't show this role is paused, cancelled or filled.`);
  if ((p.listing.status === "found" || p.listing.status === "baseline_found") && stale) {
    caveats.push(`Crustdata ${p.listing.checkedOn ? `on ${p.listing.checkedOn} ` : ""}${p.listing.status === "baseline_found" ? "currently lists a matching public role (first check, no earlier sighting)" : "still lists a matching public role"}. A public listing doesn't confirm the agency's mandate or its candidate's process is still on track.`);
  }
  if (missing.length === 0) {
    return { outcome: "unreviewed", needsTask: false, considered, missing, caveats, observation: ["Recent client confirmation for this role.", ...caveats].join(" ") };
  }
  if (p.reply?.outcome === "unclear") caveats.push(`The client's reply${p.reply.replyDate ? ` on ${p.reply.replyDate}` : ""} doesn't say whether this role is still active, so it stays unconfirmed.`);
  for (const r of p.remarks ?? []) caveats.push(`Reported remark${r.date ? ` (${r.date})` : ""}, repeated as said and not a dated client confirmation of this role's status: ${r.text}`);
  return { outcome: "unknown", needsTask: true, considered, missing, caveats, observation: missing.join(" ") };
}
