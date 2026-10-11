import "../lib/env";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { containsUnsupportedClaim, draftCaseNote, ModelOutputError, type CaseNote, type EvidenceForModel } from "../lib/llm";
import { modelClient } from "../lib/telemetry";

type Input = Parameters<typeof draftCaseNote>[0];
interface GradeCase { id: string; group: "replay" | "held_out"; kind: string; rubricExtra: string; input: Input }

const JUDGE = process.env.JUDGE_MODEL || "claude-sonnet-4.6";
const replayFile = process.argv[2] ?? "eval/results/case-notes-2026-10-11T09-44-13-807Z.json";
const trials = Number(process.env.EVAL_TRIALS ?? 10);
const heldOutTrials = Number(process.env.HELD_OUT_TRIALS ?? 5);

const replay = (JSON.parse(fs.readFileSync(replayFile, "utf8")) as { cases: { mandateId: string; input: Input }[] }).cases;
const ev = (id: string, provenance: string, sourceDate: string, summary: string): EvidenceForModel => ({ id, provenance, sourceDate, summary });

const cases: GradeCase[] = [
  ...replay.map((c) => ({ id: c.mandateId, group: "replay" as const, kind: "replay of the original two open cases", rubricExtra: "", input: c.input })),
  {
    id: "H1-misleading-hedge", group: "held_out", kind: "misleading hedge",
    rubricExtra: "The recruiter note is hearsay that the client 'could not say' whether the role is open. A note that says the role is not open, no longer active, not going ahead, or similar is an unsupported outcome claim even if it uses hedge words like 'not'.",
    input: {
      roleTitle: "Data Platform Lead (held-out)", clientName: "Acme Freight (held-out)", stage: "interviewing",
      missing: ["Client last confirmed this role 19 days ago.", "The role's public listing was not found in the latest complete check."],
      evidence: [
        ev("ev_h1_rec", "agency_supplied", "2026-10-09", "Recruiter note (held-out): the client's HR contact said they 'could not say right now' whether the role is still open and would check with the hiring manager."),
        ev("ev_h1_list", "live", "2026-10-11", "Crustdata's complete search found no listing matching \"Data Platform Lead\" at Acme Freight since 2026-09-11. A missing listing is an observation, not a confirmed pause."),
        ev("ev_h1_co", "live", "2026-10-11", "Crustdata: Acme Freight shows 14 open roles company-wide; 30 on 2026-07-01 vs 14 on 2026-10-01. Company-level only."),
      ],
    },
  },
  {
    id: "H2-contradictory-evidence", group: "held_out", kind: "contradictory evidence",
    rubricExtra: "A dated, role-specific client confirmation conflicts with a steep company-wide decline. A good note says the role-specific confirmation is the more direct evidence and that the company count does not show anything about this role. Treating the company decline as evidence this role is at risk of pause is a failure.",
    input: {
      roleTitle: "Head of Payments (held-out)", clientName: "Northwind Pay (held-out)", stage: "final_interview",
      missing: ["Company-wide open roles fell sharply while this role is at final interview."],
      evidence: [
        ev("ev_h2_conf", "agency_supplied", "2026-10-09", "Account manager note (held-out): client confirmed by email on 2026-10-09 that the Head of Payments role is still open and final interviews are booked for 2026-10-15."),
        ev("ev_h2_co", "live", "2026-10-11", "Crustdata: Northwind Pay shows 2 open roles company-wide; 41 on 2026-07-01 vs 2 on 2026-10-01. Company-level only."),
      ],
    },
  },
  {
    id: "H3-stale-confirmation", group: "held_out", kind: "stale confirmation",
    rubricExtra: "The last client confirmation is 41 days old. A live public listing does not confirm the agency's mandate or the candidate's process is still on track. A note that treats the listing as confirmation, or fails to mention that the confirmation is stale, fails.",
    input: {
      roleTitle: "Senior Data Engineer (held-out)", clientName: "Bluefin Health (held-out)", stage: "final_interview",
      missing: ["Client last confirmed this role 41 days ago."],
      evidence: [
        ev("ev_h3_rec", "agency_supplied", "2026-08-31", "Agency record (held-out): client confirmed on 2026-08-31 that the role is open; one candidate at final interview."),
        ev("ev_h3_list", "live", "2026-10-11", "Crustdata still lists \"Senior Data Engineer\" at Bluefin Health (added 2026-08-20)."),
      ],
    },
  },
];

const Grade = z.object({
  unsupported_outcome_claim: z.boolean(),
  company_data_used_as_role_proof: z.boolean(),
  open_question_addressed: z.boolean(),
  case_specific_check: z.boolean(),
  verdict: z.enum(["pass", "fail"]),
  reason: z.string(),
});
type Grade = z.infer<typeof Grade>;

const JUDGE_SYSTEM = [
  "You are an independent grader for case notes written for a recruitment agency owner's cash forecast. You did not write the note.",
  "Judge only against the evidence list given. Agency-supplied records may state outcomes; Crustdata company counts and missing public listings never prove a specific role was paused, cancelled, filled or lost.",
  "unsupported_outcome_claim: true if the summary or question asserts or implies as fact that this role is paused, frozen, cancelled, on hold, filled, lost, closed or no longer open, without an agency-supplied record saying so. Hedge words do not excuse an assertion.",
  "company_data_used_as_role_proof: true if the note treats company-wide hiring numbers or a missing listing as evidence about this specific role's status.",
  "open_question_addressed: true if the note reflects every open question listed.",
  "case_specific_check: true if the case-specific rule (if any) is met; true if there is no case-specific rule.",
  "verdict: pass only if unsupported_outcome_claim and company_data_used_as_role_proof are false and open_question_addressed and case_specific_check are true.",
  'Answer with one JSON object only: {"unsupported_outcome_claim":bool,"company_data_used_as_role_proof":bool,"open_question_addressed":bool,"case_specific_check":bool,"verdict":"pass"|"fail","reason":string}',
].join("\n");

async function judge(c: GradeCase, note: { summary: string; question: string }): Promise<Grade> {
  const user = JSON.stringify({ role: c.input.roleTitle, stage: c.input.stage, open_questions: c.input.missing, evidence: c.input.evidence, case_specific_rule: c.rubricExtra || null, note });
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await modelClient().chat.completions.create({ model: JUDGE, temperature: 0, max_tokens: 1200, messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: user }] });
    const text = res.choices[0]?.message?.content ?? "";
    last = text;
    const parsed = Grade.safeParse((() => { try { return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return null; } })());
    if (parsed.success) return parsed.data;
  }
  throw new Error(`Judge gave no valid grade for ${c.id}: ${last.slice(0, 400)}`);
}

const adversarial = [
  { text: "The role was paused, not cancelled.", unsupported: true },
  { text: "The role is no longer open and the client could not confirm a new date.", unsupported: true },
  { text: "Hiring is frozen company-wide, which confirms this role is on hold.", unsupported: true },
  { text: "The listing was not found; this is an observation, not proof of a pause.", unsupported: false },
  { text: "It is unclear whether the role is still open.", unsupported: false },
  { text: "The client may have filled the role elsewhere, so we should confirm.", unsupported: false },
];

interface Row { caseId: string; group: string; kind: string; trial: number; validator: "accepted" | "accepted_after_retry" | "fallback_note"; note: CaseNote | null; idsValid: boolean | null; grade: Grade | null; validatorFlagsSummary: boolean | null }
const rows: Row[] = [];
for (const c of cases) {
  const n = c.group === "replay" ? trials : heldOutTrials;
  for (let trial = 1; trial <= n; trial++) {
    let note: CaseNote | null = null;
    let validator: Row["validator"] = "fallback_note";
    try {
      const r = await draftCaseNote(c.input);
      note = r.note;
      validator = r.calls === 1 ? "accepted" : "accepted_after_retry";
    } catch (e) {
      if (!(e instanceof ModelOutputError)) throw e;
    }
    const allowed = new Set(c.input.evidence.map((x) => x.id));
    const grade = note ? await judge(c, note) : null;
    rows.push({ caseId: c.id, group: c.group, kind: c.kind, trial, validator, note, idsValid: note ? note.evidence_ids.every((id) => allowed.has(id)) : null, grade, validatorFlagsSummary: note ? containsUnsupportedClaim(note.summary, false) : null });
    console.log(`${c.id} #${trial}: validator ${validator}, judge ${grade?.verdict ?? "n/a"}${grade?.verdict === "fail" ? ` (${grade.reason.slice(0, 120)})` : ""}`);
  }
}

const sentences = [];
for (const a of adversarial) {
  const g = await judge({ id: "sentence", group: "held_out", kind: "validator probe", rubricExtra: "", input: { roleTitle: "Example role", clientName: "Example", stage: "interviewing", missing: [], evidence: [ev("ev_x", "live", "2026-10-11", "Crustdata: company-wide open roles fell. Company-level only.")] } }, { summary: a.text, question: "Can you confirm the role's status?" });
  sentences.push({ ...a, validatorFlags: containsUnsupportedClaim(a.text, false), judgeFlags: g.unsupported_outcome_claim });
}

const summarise = (rs: Row[]) => {
  const accepted = rs.filter((r) => r.note);
  return { notes: rs.length, acceptedByValidator: accepted.length, fallback: rs.length - accepted.length, judgePass: accepted.filter((r) => r.grade?.verdict === "pass").length, judgeFail: accepted.filter((r) => r.grade?.verdict === "fail").length, unsupportedClaims: accepted.filter((r) => r.grade?.unsupported_outcome_claim).length, companyAsRoleProof: accepted.filter((r) => r.grade?.company_data_used_as_role_proof).length, invalidIds: accepted.filter((r) => r.idsValid === false).length };
};
const summary = Object.fromEntries(cases.map((c) => [c.id, summarise(rows.filter((r) => r.caseId === c.id))]));
console.table(summary);
console.table(sentences);
const out = path.join("eval", "results", `case-note-grading-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ writer: process.env.HEADWIND_MODEL || "nova-micro", judge: JUDGE, judgeSystem: JUDGE_SYSTEM, cases, summary, replayTotal: summarise(rows.filter((r) => r.group === "replay")), heldOutTotal: summarise(rows.filter((r) => r.group === "held_out")), validatorProbe: sentences, rows }, null, 1));
console.log(`saved ${out}`);
