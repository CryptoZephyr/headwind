import "../lib/env";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { containsUnsupportedClaim, draftCaseNote, evidenceFallbackNote, ModelOutputError, NOTE_ATTEMPTS, withRequiredFacts, type CaseNote, type EvidenceForModel, type RejectedDraft } from "../lib/llm";
import { coveredEvidenceIds, decideTreatment, type PolicyInput, type PolicyResult } from "../lib/policy";
import { modelClient, modelName, startTelemetry, stopTelemetry, workflow } from "../lib/telemetry";

type Cohort = "regenerated_original_v3" | "held_out_informed_fix" | "fresh_round1_informed" | "fresh_round2" | "fresh_round3" | "fresh_round4";
interface Case { id: string; cohort: Cohort; kind: string; roleTitle: string; clientName: string; stage: string; policy: Omit<PolicyInput, "stage" | "cashDate">; evidence: EvidenceForModel[]; expectedCaveats: string[] }

const REVIEW_DATE = "2026-10-11";
const JUDGE = process.env.JUDGE_MODEL || "claude-sonnet-4.6";
const TRIALS = Number(process.env.EVAL_TRIALS ?? 10);
const OTHER_TRIALS = Number(process.env.HELD_OUT_TRIALS ?? 5);
const remarkIds = new Set<string>();
const ev = (id: string, provenance: string, sourceDate: string, summary: string, sourceType?: "agency_update"): EvidenceForModel => {
  if (sourceType === "agency_update") remarkIds.add(id);
  return { id, provenance, sourceDate, summary };
};
const sourceType = (e: EvidenceForModel): string =>
  remarkIds.has(e.id) ? "agency_update"
    : /^Client record:/.test(e.summary) ? "client_confirmation"
      : /^Crustdata: .*company-wide/.test(e.summary) ? "company_snapshot"
        : /^(Baseline: )?Crustdata('s)? (complete search|still lists|currently lists|lists|listing search)/.test(e.summary) ? "listing_check"
          : "other";
const trend = (fromJobs: number, toJobs: number) => ({ fromDate: "2026-07-01", fromJobs, toDate: "2026-10-01", toJobs });
const replay = (JSON.parse(fs.readFileSync("eval/results/case-notes-2026-10-11T09-44-13-807Z.json", "utf8")) as { cases: { mandateId: string; input: { evidence: EvidenceForModel[] } }[] }).cases;
const replayEvidence = (id: string) => replay.find((c) => c.mandateId === id)!.input.evidence;

const cases: Case[] = [
  { id: "M-102", cohort: "regenerated_original_v3", kind: "sample case, confirmation 12 days old", roleTitle: "Product Engineer (sample)", clientName: "Linear", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-09-29", listing: { status: "baseline_absent" }, reply: null, companyTrend: null }, evidence: replayEvidence("M-102"),
    expectedCaveats: ["States the client's last confirmation date (2026-09-29) or its age (12 days) and that it needs reconfirming."] },
  { id: "M-103", cohort: "regenerated_original_v3", kind: "sample case, stale confirmation, missing listing, company decline", roleTitle: "Staff Billing Platform Engineer (sample)", clientName: "Vercel", stage: "interviewing",
    policy: { lastConfirmedAt: "2026-09-08", listing: { status: "not_found" }, reply: null, companyTrend: { fromDate: "2026-07-01", fromJobs: 48, toDate: "2026-10-01", toJobs: 1 } }, evidence: replayEvidence("M-103"),
    expectedCaveats: ["States the last confirmation date (2026-09-08) or its age (33 days) and that it needs reconfirming.", "Says the company-wide decline and the missing listing don't establish this role's status, and that the role's status is unresolved."] },
  { id: "H1-misleading-hedge", cohort: "held_out_informed_fix", kind: "misleading hedge", roleTitle: "Data Platform Lead (held-out)", clientName: "Acme Freight (held-out)", stage: "interviewing",
    policy: { lastConfirmedAt: "2026-09-22", listing: { status: "not_found" }, reply: null, companyTrend: trend(30, 14) },
    evidence: [
      ev("ev_h1_rec", "agency_supplied", "2026-10-09", "Recruiter note (held-out): the client's HR contact said they 'could not say right now' whether the role is still open and would check with the hiring manager.", "agency_update"),
      ev("ev_h1_list", "live", "2026-10-11", "Crustdata's complete search found no listing matching \"Data Platform Lead\" at Acme Freight since 2026-09-11. A missing listing is an observation, not a confirmed pause."),
      ev("ev_h1_co", "live", "2026-10-11", "Crustdata: Acme Freight shows 14 open roles company-wide; 30 on 2026-07-01 vs 14 on 2026-10-01. Company-level only."),
    ], expectedCaveats: ["States the last confirmation date (2026-09-22) or age (19 days) and that it needs reconfirming.", "Doesn't present the HR contact's 'could not say' as an answer either way."] },
  { id: "H2-contradictory-evidence", cohort: "held_out_informed_fix", kind: "contradictory evidence (fresh confirmation vs company decline)", roleTitle: "Head of Payments (held-out)", clientName: "Northwind Pay (held-out)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-10-09", listing: { status: "baseline_absent" }, reply: null, companyTrend: trend(41, 2) },
    evidence: [
      ev("ev_h2_conf", "agency_supplied", "2026-10-09", "Account manager note (held-out): client confirmed by email on 2026-10-09 that the Head of Payments role is still open and final interviews are booked for 2026-10-15."),
      ev("ev_h2_co", "live", "2026-10-11", "Crustdata: Northwind Pay shows 2 open roles company-wide; 41 on 2026-07-01 vs 2 on 2026-10-01. Company-level only."),
    ], expectedCaveats: ["Names both sources with their dates (client confirmation 2026-10-09; company counts 2026-07-01 and 2026-10-01).", "Says why the role-specific confirmation decides the treatment.", "Says what remains unresolved."] },
  { id: "H3-stale-confirmation", cohort: "held_out_informed_fix", kind: "stale confirmation with a live listing", roleTitle: "Senior Data Engineer (held-out)", clientName: "Bluefin Health (held-out)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-08-31", listing: { status: "found", checkedOn: "2026-10-11" }, reply: null, companyTrend: null },
    evidence: [
      ev("ev_h3_rec", "agency_supplied", "2026-08-31", "Agency record (held-out): client confirmed on 2026-08-31 that the role is open; one candidate at final interview."),
      ev("ev_h3_list", "live", "2026-10-11", "Crustdata still lists \"Senior Data Engineer\" at Bluefin Health (added 2026-08-20)."),
    ], expectedCaveats: ["States the confirmation is 41 days old (or dated 2026-08-31) and needs reconfirming.", "Says the live listing doesn't confirm the mandate or candidate process."] },
  { id: "F1-hearsay-slowdown", cohort: "fresh_round1_informed", kind: "misleading hedge (hearsay about slowing hiring)", roleTitle: "Analytics Engineer (fresh)", clientName: "Corvid Logistics (fresh)", stage: "interviewing",
    policy: { lastConfirmedAt: "2026-09-27", listing: { status: "not_found" }, reply: null, companyTrend: null },
    evidence: [
      ev("ev_f1_rec", "agency_supplied", "2026-10-07", "Recruiter note (fresh): the client's talent partner said hiring is 'probably slowing down, nothing decided yet' and asked us to keep the candidate warm.", "agency_update"),
      ev("ev_f1_list", "live", "2026-10-11", "Crustdata's complete search found no listing matching \"Analytics Engineer\" at Corvid Logistics since 2026-09-11. A missing listing is an observation, not a confirmed pause."),
    ], expectedCaveats: ["States the last confirmation date (2026-09-27) or age (14 days) and that it needs reconfirming.", "Treats 'probably slowing down, nothing decided' as undecided, not as a pause or freeze."] },
  { id: "F2-decline-vs-stale-confirmation", cohort: "fresh_round1_informed", kind: "contradictory evidence with a stale confirmation and a live listing", roleTitle: "Solutions Architect (fresh)", clientName: "Halcyon Robotics (fresh)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-09-15", listing: { status: "found", checkedOn: "2026-10-11" }, reply: null, companyTrend: trend(60, 12) },
    evidence: [
      ev("ev_f2_rec", "agency_supplied", "2026-09-15", "Agency record (fresh): client confirmed on 2026-09-15 that the role is open; two candidates at final interview."),
      ev("ev_f2_co", "live", "2026-10-11", "Crustdata: Halcyon Robotics shows 12 open roles company-wide; 60 on 2026-07-01 vs 12 on 2026-10-01. Company-level only."),
      ev("ev_f2_list", "live", "2026-10-11", "Crustdata still lists \"Solutions Architect\" at Halcyon Robotics (added 2026-08-28)."),
    ], expectedCaveats: ["Names both conflicting sources with dates (confirmation 2026-09-15; company counts 2026-07-01 and 2026-10-01).", "Says neither settles this role because the confirmation is 26 days old and the count is company-wide; status unresolved.", "Says the live listing doesn't confirm the mandate."] },
  { id: "F3-stale-with-recent-activity", cohort: "fresh_round1_informed", kind: "stale confirmation despite recent agency activity", roleTitle: "Finance Systems Manager (fresh)", clientName: "Ordway Retail (fresh)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-09-01", listing: { status: "baseline_absent" }, reply: null, companyTrend: null },
    evidence: [
      ev("ev_f3_rec", "agency_supplied", "2026-10-06", "Agency record (fresh): candidate completed the final interview on 2026-10-06; awaiting client feedback."),
      ev("ev_f3_list", "live", "2026-10-11", "Baseline: Crustdata's complete search found no listing matching \"Finance Systems Manager\" at Ordway Retail added since 2026-09-11. This is the first check for this role and Crustdata gives no earlier listing history for it, so no removal or change can be inferred yet."),
    ], expectedCaveats: ["States the client's last confirmation is from 2026-09-01 (40 days) and needs reconfirming.", "Doesn't treat the first listing check as a removal."] },
  { id: "F4-no-confirmation-growth", cohort: "fresh_round1_informed", kind: "no confirmation date, company growth, missing listing", roleTitle: "Clinical Data Lead (fresh)", clientName: "Meridian Bio (fresh)", stage: "interviewing",
    policy: { lastConfirmedAt: null, listing: { status: "not_found" }, reply: null, companyTrend: trend(10, 25) },
    evidence: [
      ev("ev_f4_co", "live", "2026-10-11", "Crustdata: Meridian Bio shows 25 open roles company-wide; 10 on 2026-07-01 vs 25 on 2026-10-01. Company-level only."),
      ev("ev_f4_list", "live", "2026-10-11", "Crustdata's complete search found no listing matching \"Clinical Data Lead\" at Meridian Bio since 2026-09-11. A missing listing is an observation, not a confirmed pause."),
    ], expectedCaveats: ["Says there is no record of when the client last confirmed the role.", "Doesn't use company growth as evidence this role is open, or the missing listing as proof it closed."] },
  { id: "F5-reply-vs-decline", cohort: "fresh_round1_informed", kind: "contradictory evidence (dated client reply vs company decline)", roleTitle: "Platform Security Engineer (fresh)", clientName: "Tessel Cloud (fresh)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-09-20", listing: { status: "baseline_absent" }, reply: { outcome: "still_active", pausedUntil: null, replyId: "r_f5", replyDate: "2026-10-10" }, companyTrend: trend(90, 30) },
    evidence: [
      ev("ev_f5_reply", "agency_supplied", "2026-10-10", "Client reply (fresh, 2026-10-10): 'Yes, we're still hiring for the Platform Security Engineer role and want to close it this month.'"),
      ev("ev_f5_co", "live", "2026-10-11", "Crustdata: Tessel Cloud shows 30 open roles company-wide; 90 on 2026-07-01 vs 30 on 2026-10-01. Company-level only."),
    ], expectedCaveats: ["Names both sources with dates (reply 2026-10-10; company counts 2026-07-01 and 2026-10-01).", "Says why the dated role-specific reply decides the treatment.", "Says what remains unresolved."] },
  { id: "G1-not-cancelled-quote", cohort: "fresh_round2", kind: "misleading hedge (client quote with a negation)", roleTitle: "Payroll Implementation Lead (fresh-2)", clientName: "Kestrel Foods (fresh-2)", stage: "interviewing",
    policy: { lastConfirmedAt: "2026-09-25", listing: { status: "still_absent" }, reply: null, companyTrend: null },
    evidence: [
      ev("ev_g1_upd", "agency_supplied", "2026-10-08", "Recruiter note (fresh-2) on 2026-10-08: the hiring manager said the role is 'not cancelled, approvals are just slower this quarter'; no new interview dates were given.", "agency_update"),
      ev("ev_g1_list", "live", "2026-10-11", "Crustdata's complete search still finds no listing matching \"Payroll Implementation Lead\" at Kestrel Foods added since 2026-09-11. The role hasn't been seen listed since the first check on 2026-10-04, so no removal can be inferred."),
    ], expectedCaveats: ["States the last client confirmation date (2026-09-25) or age (16 days) and that it needs reconfirming.", "Reports the hiring manager's remark as reported, without turning it into a pause, delay or freeze of the role.", "Doesn't treat the never-seen listing as a removal."] },
  { id: "G2-fresh-confirmation-missing-listing-decline", cohort: "fresh_round2", kind: "contradictory evidence (fresh confirmation, company decline, missing listing)", roleTitle: "Revenue Operations Manager (fresh-2)", clientName: "Lumen Mobility (fresh-2)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-10-06", listing: { status: "not_found" }, reply: null, companyTrend: trend(120, 40) },
    evidence: [
      ev("ev_g2_seen", "agency_supplied", "2026-09-20", "Agency saw the public listing for \"Revenue Operations Manager\" on 2026-09-20."),
      ev("ev_g2_co", "live", "2026-10-11", "Crustdata: Lumen Mobility shows 40 open roles company-wide; 120 on 2026-07-01 vs 40 on 2026-10-01. Company-level only."),
      ev("ev_g2_list", "live", "2026-10-11", "Crustdata's complete search found no listing matching \"Revenue Operations Manager\" at Lumen Mobility since 2026-09-11. A missing listing is an observation, not a confirmed pause."),
    ], expectedCaveats: ["Names the client confirmation (2026-10-06) and the company counts with their dates (2026-07-01, 2026-10-01).", "Says why the dated role confirmation outweighs the company decline.", "Says what remains unresolved, including that the missing listing is only an observation."] },
  { id: "G3-stale-unclear-reply", cohort: "fresh_round2", kind: "stale confirmation with an unclear client reply and a live listing", roleTitle: "Head of Clinical Operations (fresh-2)", clientName: "Ostrava Health (fresh-2)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-09-10", listing: { status: "found", checkedOn: "2026-10-11" }, reply: { outcome: "unclear", pausedUntil: null, replyId: "r_g3", replyDate: "2026-10-09" }, companyTrend: null },
    evidence: [
      ev("ev_g3_reply", "agency_supplied", "2026-10-09", "Client reply (fresh-2, 2026-10-09): 'We'll come back to you after the board meeting.'"),
      ev("ev_g3_list", "live", "2026-10-11", "Crustdata still lists \"Head of Clinical Operations\" at Ostrava Health (added 2026-08-15)."),
    ], expectedCaveats: ["States the last confirmation date (2026-09-10) or age (31 days) and that it needs reconfirming.", "Says the 2026-10-09 reply doesn't answer whether the role is still active.", "Says the live listing doesn't confirm the mandate."] },
  { id: "K1-internal-fill-rumour", cohort: "fresh_round3", kind: "misleading hedge (rumour of an internal fill) with stale confirmation and company growth", roleTitle: "Treasury Analyst (fresh-3)", clientName: "Pellucid Energy (fresh-3)", stage: "interviewing",
    policy: { lastConfirmedAt: "2026-09-20", listing: { status: "still_absent" }, reply: null, companyTrend: trend(15, 22) },
    evidence: [
      ev("ev_k1_upd", "agency_supplied", "2026-10-07", "Recruiter note (fresh-3) on 2026-10-07: the client's finance director mentioned they 'might move someone across internally, nothing agreed'.", "agency_update"),
      ev("ev_k1_co", "live", "2026-10-11", "Crustdata: Pellucid Energy shows 22 open roles company-wide; 15 on 2026-07-01 vs 22 on 2026-10-01. Company-level only."),
      ev("ev_k1_list", "live", "2026-10-11", "Crustdata's complete search still finds no listing matching \"Treasury Analyst\" at Pellucid Energy added since 2026-09-11. The role hasn't been seen listed since the first check on 2026-10-04, so no removal can be inferred."),
    ], expectedCaveats: ["States the last confirmation date (2026-09-20) or age (21 days) and that it needs reconfirming.", "Reports the internal-move remark as unagreed, not as the role being filled.", "Doesn't use company growth or the never-seen listing as evidence about this role."] },
  { id: "K2-fresh-confirmation-unclear-reply", cohort: "fresh_round3", kind: "fresh confirmation, unclear later reply, listing gone after a sighting", roleTitle: "Head of Customer Success (fresh-3)", clientName: "Quillon Software (fresh-3)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-10-08", listing: { status: "not_found", checkedOn: "2026-10-11" }, reply: { outcome: "unclear", pausedUntil: null, replyId: "r_k2", replyDate: "2026-10-10" }, companyTrend: null },
    evidence: [
      ev("ev_k2_reply", "agency_supplied", "2026-10-10", "Client reply (fresh-3, 2026-10-10): 'Let's pick this up on our call next week.'"),
      ev("ev_k2_list", "live", "2026-10-11", "Crustdata's complete search found no listing matching \"Head of Customer Success\" at Quillon Software; it was listed at the 2026-10-04 check. A missing listing is an observation, not a confirmed pause."),
    ], expectedCaveats: ["States the 2026-10-08 confirmation is within the 10-day limit.", "Says the 2026-10-10 reply doesn't answer whether the role is still active.", "Says the missing listing is only an observation."] },
  { id: "K3-no-confirmation-first-sighting-decline", cohort: "fresh_round3", kind: "no confirmation on record, first listing sighting, company decline", roleTitle: "Senior Firmware Engineer (fresh-3)", clientName: "Harrow Devices (fresh-3)", stage: "interviewing",
    policy: { lastConfirmedAt: null, listing: { status: "baseline_found", checkedOn: "2026-10-11" }, reply: null, companyTrend: trend(60, 18) },
    evidence: [
      ev("ev_k3_co", "live", "2026-10-11", "Crustdata: Harrow Devices shows 18 open roles company-wide; 60 on 2026-07-01 vs 18 on 2026-10-01. Company-level only."),
      ev("ev_k3_list", "live", "2026-10-11", "Crustdata lists \"Senior Firmware Engineer\" at Harrow Devices (added 2026-09-28). This is the first check for this role."),
    ], expectedCaveats: ["Says there is no record of when the client last confirmed the role.", "Says the current listing doesn't confirm the agency's mandate.", "Doesn't treat the company-wide decline as evidence about this role."] },
  { id: "L1-gone-quiet-decline", cohort: "fresh_round4", kind: "never-seen listing, stale confirmation, company decline, vague remark", roleTitle: "Procurement Manager (fresh-4)", clientName: "Ashgrove Foods (fresh-4)", stage: "interviewing",
    policy: { lastConfirmedAt: "2026-09-16", listing: { status: "still_absent", checkedOn: "2026-10-11" }, reply: null, companyTrend: trend(55, 20) },
    evidence: [
      ev("ev_l1_upd", "agency_supplied", "2026-10-08", "Recruiter note (fresh-4) on 2026-10-08: the hiring manager 'has gone a bit quiet' since the last interview round; no decision was mentioned.", "agency_update"),
      ev("ev_l1_co", "live", "2026-10-11", "Crustdata: Ashgrove Foods shows 20 open roles company-wide; 55 on 2026-07-01 vs 20 on 2026-10-01. Company-level only."),
      ev("ev_l1_list", "live", "2026-10-11", "Crustdata's complete search still finds no listing matching \"Procurement Manager\" at Ashgrove Foods added since 2026-09-11. The role hasn't been seen listed since the first check on 2026-10-04, so no removal can be inferred."),
    ], expectedCaveats: ["States the last confirmation date (2026-09-16) or age (25 days) and that it needs reconfirming.", "Reports the 'gone quiet' remark as reported, not as a pause, freeze or loss of the role.", "Doesn't use the company-wide decline or the never-seen listing as evidence about this role."] },
  { id: "L2-first-check-no-confirmation-vague-reply", cohort: "fresh_round4", kind: "first check with no listing, no confirmation on record, non-answer reply", roleTitle: "Quality Assurance Lead (fresh-4)", clientName: "Brightwell Labs (fresh-4)", stage: "interviewing",
    policy: { lastConfirmedAt: null, listing: { status: "baseline_absent", checkedOn: "2026-10-11" }, reply: { outcome: "unclear", pausedUntil: null, replyId: "r_l2", replyDate: "2026-10-09" }, companyTrend: null },
    evidence: [
      ev("ev_l2_reply", "agency_supplied", "2026-10-09", "Client reply (fresh-4, 2026-10-09): 'Thanks, noted. Speak soon.'"),
      ev("ev_l2_list", "live", "2026-10-11", "Baseline: Crustdata's complete search found no listing matching \"Quality Assurance Lead\" at Brightwell Labs added since 2026-09-11. This is the first check for this role and Crustdata gives no earlier listing history for it, so no removal or change can be inferred yet."),
    ], expectedCaveats: ["Says there is no record of when the client last confirmed the role.", "Says the 2026-10-09 reply doesn't answer whether the role is still active.", "Doesn't treat the first-check absence of a listing as evidence about this role."] },
  { id: "L3-just-stale-growth-budget-hint", cohort: "fresh_round4", kind: "confirmation one day past the limit, never-seen listing, company growth, second-hand budget hint", roleTitle: "Senior Tax Accountant (fresh-4)", clientName: "Calder & Finch (fresh-4)", stage: "final_interview",
    policy: { lastConfirmedAt: "2026-09-30", listing: { status: "still_absent", checkedOn: "2026-10-11" }, reply: null, companyTrend: trend(8, 19) },
    evidence: [
      ev("ev_l3_upd", "agency_supplied", "2026-10-09", "Recruiter note (fresh-4) on 2026-10-09: the candidate said the hiring manager 'hinted the budget is tight this quarter'.", "agency_update"),
      ev("ev_l3_co", "live", "2026-10-11", "Crustdata: Calder & Finch shows 19 open roles company-wide; 8 on 2026-07-01 vs 19 on 2026-10-01. Company-level only."),
      ev("ev_l3_list", "live", "2026-10-11", "Crustdata's complete search still finds no listing matching \"Senior Tax Accountant\" at Calder & Finch added since 2026-09-11. The role hasn't been seen listed since the first check on 2026-10-04, so no removal can be inferred."),
    ], expectedCaveats: ["States the last confirmation date (2026-09-30) or age (11 days) and that it is past the 10-day limit and needs reconfirming.", "Reports the second-hand budget hint as reported, not as a freeze, pause or cancellation.", "Doesn't use company growth as evidence the role is open, or the never-seen listing as evidence it closed."] },
];
for (const c of cases) {
  const window = c.evidence.map((e) => e.summary.match(/(?:Crustdata's complete search|Baseline: Crustdata's complete search)[^.]*?since (\d{4}-\d{2}-\d{2})/)?.[1]).find(Boolean);
  if (window && ["not_found", "still_absent", "baseline_absent"].includes(c.policy.listing.status)) c.policy.listing.searchedSince = window;
  c.policy.remarks = c.evidence.filter((e) => remarkIds.has(e.id)).map((e) => ({ date: e.sourceDate, text: e.summary }));
  if (c.policy.lastConfirmedAt) c.evidence.unshift(ev(`ev_${c.id.slice(0, 3).toLowerCase()}_confirm`, "agency_supplied", c.policy.lastConfirmedAt, `Client record: ${c.clientName} last confirmed its open roles with the agency on ${c.policy.lastConfirmedAt}.`));
}

const Grade = z.object({
  unsupported_outcome_claim: z.boolean(),
  company_data_used_as_role_proof: z.boolean(),
  caveats_complete: z.boolean(),
  missing_caveats: z.array(z.string()),
  verdict: z.enum(["pass", "fail"]),
  reason: z.string(),
});
type Grade = z.infer<typeof Grade>;

const JUDGE_SYSTEM = [
  "You are an independent grader for case notes in a recruitment agency owner's cash forecast. You did not write the note and you don't know how it was produced.",
  "Judge only against the evidence list and the review date given. Agency-supplied records may state outcomes; Crustdata company counts and missing public listings never prove a specific role was paused, cancelled, filled or lost.",
  "unsupported_outcome_claim: true if the summary or question asserts or implies as fact that this role is paused, frozen, cancelled, on hold, filled, lost, closed or no longer open without an agency-supplied record saying so. A hedge word elsewhere in the sentence doesn't excuse a separate assertion.",
  "company_data_used_as_role_proof: true if the note treats company-wide hiring numbers or a missing listing as evidence about this specific role's status.",
  "caveats_complete: true only if the note covers every item in expected_caveats. List any it misses in missing_caveats.",
  "verdict: pass only if unsupported_outcome_claim and company_data_used_as_role_proof are false and caveats_complete is true.",
  'Answer with one JSON object only: {"unsupported_outcome_claim":bool,"company_data_used_as_role_proof":bool,"caveats_complete":bool,"missing_caveats":string[],"verdict":"pass"|"fail","reason":string}',
].join("\n");

async function judge(c: Pick<Case, "roleTitle" | "stage" | "evidence" | "expectedCaveats">, note: { summary: string; question: string | null }): Promise<Grade> {
  const user = JSON.stringify({ review_date: REVIEW_DATE, role: c.roleTitle, stage: c.stage, evidence: c.evidence, expected_caveats: c.expectedCaveats, note });
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await modelClient().chat.completions.create({ model: JUDGE, temperature: 0, max_tokens: 1200, messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: user }] });
    last = res.choices[0]?.message?.content ?? "";
    const parsed = Grade.safeParse((() => { try { return JSON.parse(last.slice(last.indexOf("{"), last.lastIndexOf("}") + 1)); } catch { return null; } })());
    if (parsed.success) return parsed.data;
  }
  throw new Error(`Judge gave no valid grade: ${last.slice(0, 400)}`);
}

interface Row { caseId: string; cohort: Cohort; kind: string; trial: number; source: "model" | "model_fallback" | "code_only" | "deterministic"; writerCalls: number; rejectedDrafts: RejectedDraft[]; traceId: string | null; policy: PolicyResult; note: CaseNote | { summary: string; question: null; evidence_ids: string[] }; requiredFactsPresent: boolean; checkerFlagsSummary: boolean; idsValid: boolean; grade: Grade }

await startTelemetry("headwind.eval.revised_notes");
const rows: Row[] = [];
for (const c of cases) {
  const policy = decideTreatment({ ...c.policy, stage: c.stage, cashDate: REVIEW_DATE });
  const covered = coveredEvidenceIds(c.evidence.map((e) => ({ id: e.id, sourceType: sourceType(e) })), policy.coveredSources);
  const n = !policy.needsTask ? 1 : c.cohort === "regenerated_original_v3" ? TRIALS : OTHER_TRIALS;
  for (let trial = 1; trial <= n; trial++) {
    let row: Omit<Row, "grade" | "requiredFactsPresent" | "checkerFlagsSummary" | "idsValid">;
    if (!policy.needsTask) {
      row = { caseId: c.id, cohort: c.cohort, kind: c.kind, trial, source: "deterministic", writerCalls: 0, rejectedDrafts: [], traceId: null, policy, note: { summary: policy.observation, question: null, evidence_ids: c.evidence.map((e) => e.id) } };
    } else if (covered.length === c.evidence.length) {
      const note = evidenceFallbackNote({ observation: (policy.openQuestions ?? [policy.observation]).join(" "), caveats: policy.caveats, evidence: c.evidence, question: `Is the ${c.roleTitle} role at ${c.clientName} still open?` });
      row = { caseId: c.id, cohort: c.cohort, kind: c.kind, trial, source: "code_only", writerCalls: 0, rejectedDrafts: [], traceId: null, policy, note };
    } else {
      row = await workflow("eval.case_note", async (traceId) => {
        try {
          const r = await draftCaseNote({ roleTitle: c.roleTitle, clientName: c.clientName, stage: c.stage, missing: policy.openQuestions ?? policy.missing, requiredFacts: policy.caveats, coveredEvidenceIds: covered, evidence: c.evidence });
          return { caseId: c.id, cohort: c.cohort, kind: c.kind, trial, source: "model" as const, writerCalls: r.calls, rejectedDrafts: r.rejected ?? [], traceId, policy, note: withRequiredFacts(r.note, policy.caveats) };
        } catch (e) {
          if (!(e instanceof ModelOutputError)) throw e;
          const note = evidenceFallbackNote({ observation: (policy.openQuestions ?? [policy.observation]).join(" "), caveats: policy.caveats, evidence: c.evidence, question: `Is the ${c.roleTitle} role at ${c.clientName} still open?` });
          return { caseId: c.id, cohort: c.cohort, kind: c.kind, trial, source: "model_fallback" as const, writerCalls: NOTE_ATTEMPTS, rejectedDrafts: e.rejected, traceId, policy, note };
        }
      });
    }
    const allowed = new Set(c.evidence.map((x) => x.id));
    const grade = await judge(c, { summary: row.note.summary, question: row.note.question });
    rows.push({ ...row, requiredFactsPresent: policy.caveats.every((f) => row.note.summary.includes(f)), checkerFlagsSummary: containsUnsupportedClaim(row.note.summary, false), idsValid: row.note.evidence_ids.every((id) => allowed.has(id)), grade });
    console.log(`${c.id} #${trial} ${row.source}: ${grade.verdict}${grade.verdict === "fail" ? ` (${grade.reason.slice(0, 140)})` : ""}`);
  }
}

const probes = [
  { text: "The role was paused, not cancelled.", unsupported: true },
  { text: "The role is no longer open and the client could not confirm a new date.", unsupported: true },
  { text: "Hiring is frozen company-wide, which confirms this role is on hold.", unsupported: true },
  { text: "The role was possibly delayed; it was cancelled last week.", unsupported: true },
  { text: "Unconfirmed reports aside, the role is filled.", unsupported: true },
  { text: "The listing was not found; this is an observation, not proof of a pause.", unsupported: false },
  { text: "It is unclear whether the role is still open.", unsupported: false },
  { text: "The client may have filled the role elsewhere, so we should confirm.", unsupported: false },
  { text: "There is no evidence, so far, that the role was cancelled.", unsupported: false },
  { text: "The evidence shows the role was cancelled.", unsupported: true },
  { text: "It is unclear whether the role was paused, but it was cancelled last week.", unsupported: true },
  { text: "It is unclear whether the role was paused, cancelled or filled.", unsupported: false },
  { text: "The listing was not found in the latest complete check, indicating it may no longer be active.", unsupported: true },
  { text: "The missing listing does not indicate that the role was cancelled.", unsupported: false },
  { text: "The role may be paused, definitely cancelled.", unsupported: true },
  { text: "There is insufficient evidence that the role was cancelled.", unsupported: false },
  { text: "These observations never prove, indicate, or suggest that the role was paused.", unsupported: false },
];
const probeCase = { roleTitle: "Example role", stage: "interviewing", evidence: [ev("ev_x", "live", REVIEW_DATE, "Crustdata: company-wide open roles fell. Company-level only.")], expectedCaveats: [] };
const validatorProbe = [];
for (const p of probes) validatorProbe.push({ ...p, checkerFlags: containsUnsupportedClaim(p.text, false), judgeFlags: (await judge(probeCase, { summary: p.text, question: "Can you confirm the role's status?" })).unsupported_outcome_claim });

const tally = (rs: Row[]) => ({
  notes: rs.length,
  modelNotes: rs.filter((r) => r.source === "model").length,
  fallbackNotes: rs.filter((r) => r.source === "model_fallback").length,
  codeOnlyNotes: rs.filter((r) => r.source === "code_only").length,
  deterministicNotes: rs.filter((r) => r.source === "deterministic").length,
  unsupportedClaims: rs.filter((r) => r.grade.unsupported_outcome_claim).length,
  companyAsRoleProof: rs.filter((r) => r.grade.company_data_used_as_role_proof).length,
  caveatsCompleteJudge: rs.filter((r) => r.grade.caveats_complete).length,
  requiredFactsPresent: rs.filter((r) => r.requiredFactsPresent).length,
  pass: rs.filter((r) => r.grade.verdict === "pass").length,
  invalidIds: rs.filter((r) => !r.idsValid).length,
});
const byCase = Object.fromEntries(cases.map((c) => [c.id, tally(rows.filter((r) => r.caseId === c.id))]));
const byCohort = Object.fromEntries((["regenerated_original_v3", "held_out_informed_fix", "fresh_round1_informed", "fresh_round2", "fresh_round3", "fresh_round4"] as Cohort[]).map((k) => [k, tally(rows.filter((r) => r.cohort === k))]));
console.table(byCase);
console.table(byCohort);
console.table(validatorProbe.map((p) => ({ text: p.text.slice(0, 60), unsupported: p.unsupported, checker: p.checkerFlags, judge: p.judgeFlags })));
await stopTelemetry();
const out = path.join("eval", "results", `revised-note-grading-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ reviewDate: REVIEW_DATE, writer: { model: modelName(), temperature: 0, maxTokens: 700, gateway: "LiteLLM" }, judgeSettings: { temperature: 0, maxTokens: 1200, attempts: 3 }, writerAttempts: NOTE_ATTEMPTS, judge: JUDGE, rubric: JUDGE_SYSTEM, cohorts: { regenerated_original_v3: "New cohort: M-102 and M-103 redrawn with the revised writer, client confirmation now in the evidence. Not the original 20 notes, whose text was never stored.", held_out_informed_fix: "H1-H3 from the first grading run. They informed the fix, so they are not held out.", fresh_round1_informed: "F1-F5, fresh in post-fix round 1 (revised-note-grading-2026-10-11T10-46-59-012Z.json). Round 1 found the confirmation date wasn't in the evidence list, so they informed round 2.", fresh_round2: "G1-G3, written after round 2's changes. Round A7's first runs (11-53-33, 11-59-01) used them to tune the listing caveat, remark wording and prompt, so they are no longer fresh.", fresh_round3: "K1-K3, written after all A7 changes. A8 used K1 to find the missing never-seen-listing caveat, so they are no longer fresh.", fresh_round4: "L1-L3, written with their expected caveats before this run, after the never-seen-listing caveat was added, and never used to tune anything." }, cases, byCase, byCohort, validatorProbe, rows }, null, 1));
console.log(`saved ${out}`);
