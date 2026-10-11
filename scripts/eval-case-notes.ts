import "../lib/env";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db";
import { containsUnsupportedClaim, draftCaseNote as draftAfter, ModelOutputError as AfterError, type EvidenceForModel } from "../lib/llm";
import { draftCaseNote as draftBefore, ModelOutputError as BeforeError } from "../eval/baseline-llm";
import { startTelemetry, stopTelemetry, workflow } from "../lib/telemetry";

const runId = process.argv[2] ?? "run_7cd5b87fd4544ef1";
const trials = Number(process.env.EVAL_TRIALS ?? 10);
const db = getDb();

interface EvalCase { mandateId: string; input: Parameters<typeof draftAfter>[0] }

const decisions = db.prepare(
  "SELECT c.mandate_id, d.missing_facts, d.evidence_ids, m.role_title, m.stage, cl.name AS client_name FROM decision d JOIN case_record c ON c.id = d.case_id JOIN mandate m ON m.id = c.mandate_id AND m.agency_id = c.agency_id JOIN client cl ON cl.id = m.client_id AND cl.agency_id = m.agency_id WHERE d.run_id = ? ORDER BY c.mandate_id"
).all(runId) as { mandate_id: string; missing_facts: string; evidence_ids: string; role_title: string; stage: string; client_name: string }[];

const cases: EvalCase[] = decisions
  .map((d) => ({ d, missing: (JSON.parse(d.missing_facts) as string[]).filter((f) => !f.startsWith("Model note rejected")) }))
  .filter(({ missing }) => missing.length > 0)
  .map(({ d, missing }) => {
    const ids = JSON.parse(d.evidence_ids) as string[];
    const evidence = ids.map((id) => {
      const e = db.prepare("SELECT id, provenance, source_date, summary FROM evidence WHERE id = ?").get(id) as { id: string; provenance: string; source_date: string | null; summary: string };
      return { id: e.id, provenance: e.provenance, sourceDate: e.source_date, summary: e.summary } satisfies EvidenceForModel;
    });
    return { mandateId: d.mandate_id, input: { roleTitle: d.role_title, clientName: d.client_name, stage: d.stage, missing, evidence } };
  });

type Outcome = "accepted" | "accepted_after_retry" | "fallback_note" | "review_stopped";
interface Trial { version: "before" | "after"; trial: number; mandateId: string; outcome: Outcome; modelCalls: number; tokens: number; unsupportedClaimInNote: boolean; rejection: string | null; ms: number; traceId: string | null }

async function runOne(version: "before" | "after", trial: number, c: EvalCase): Promise<Trial> {
  return workflow(`case-note-eval ${version}`, async (traceId) => {
    const t0 = Date.now();
    const base = { version, trial, mandateId: c.mandateId, traceId };
    if (version === "before") {
      try {
        const r = await draftBefore(c.input);
        return { ...base, outcome: "accepted", modelCalls: 1, tokens: r.tokens, unsupportedClaimInNote: containsUnsupportedClaim(r.note.summary, false), rejection: null, ms: Date.now() - t0 };
      } catch (e) {
        if (!(e instanceof BeforeError)) throw e;
        return { ...base, outcome: "review_stopped", modelCalls: 1, tokens: 0, unsupportedClaimInNote: false, rejection: `${e.message} ${e.raw.slice(0, 240)}`, ms: Date.now() - t0 };
      }
    }
    try {
      const r = await draftAfter(c.input);
      return { ...base, outcome: r.calls === 1 ? "accepted" : "accepted_after_retry", modelCalls: r.calls, tokens: r.tokens, unsupportedClaimInNote: containsUnsupportedClaim(r.note.summary, false), rejection: null, ms: Date.now() - t0 };
    } catch (e) {
      if (!(e instanceof AfterError)) throw e;
      return { ...base, outcome: "fallback_note", modelCalls: 2, tokens: 0, unsupportedClaimInNote: false, rejection: `${e.message} ${e.raw.slice(0, 240)}`, ms: Date.now() - t0 };
    }
  });
}

await startTelemetry("case-note-eval");
const results: Trial[] = [];
for (const version of ["before", "after"] as const) {
  for (let trial = 1; trial <= trials; trial++) {
    for (const c of cases) {
      const r = await runOne(version, trial, c);
      results.push(r);
      console.log(`${version} #${trial} ${c.mandateId}: ${r.outcome}${r.rejection ? ` (${r.rejection.slice(0, 90)})` : ""} trace ${r.traceId}`);
    }
  }
}
await stopTelemetry();

const summary = (["before", "after"] as const).map((version) => {
  const rs = results.filter((r) => r.version === version);
  const count = (o: Outcome) => rs.filter((r) => r.outcome === o).length;
  return {
    version, caseNotes: rs.length, accepted: count("accepted"), acceptedAfterRetry: count("accepted_after_retry"), fallbackNotes: count("fallback_note"), reviewsStopped: count("review_stopped"),
    unsupportedClaimsInSavedNotes: rs.filter((r) => r.unsupportedClaimInNote).length, modelCalls: rs.reduce((n, r) => n + r.modelCalls, 0), tokens: rs.reduce((n, r) => n + r.tokens, 0),
  };
});
console.table(summary);
const out = path.join(process.cwd(), "eval", "results", `case-notes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ runId, model: process.env.HEADWIND_MODEL || "nova-micro", trials, cases: cases.map((c) => ({ mandateId: c.mandateId, input: c.input })), summary, results }, null, 2));
console.log(`saved ${out}`);
