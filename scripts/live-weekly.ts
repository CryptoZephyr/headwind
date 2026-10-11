import "../lib/env";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCashTable, ensureScenario, type CfoBinding } from "../lib/cfo";
import { getDb } from "../lib/db";
import { previewImport } from "../lib/importer";
import { claimRun, enqueueRun, processRun } from "../lib/review";
import { commitImport, getAgency, type CfoBindings } from "../lib/store";
import { startTelemetry, stopTelemetry } from "../lib/telemetry";

const label = process.argv[2] ?? `live weekly test ${new Date().toISOString().slice(0, 10)}`;
const db = getDb();
if ((db.prepare("SELECT COUNT(*) AS n FROM agency").get() as { n: number }).n !== 0) throw new Error("Use an empty HEADWIND_DB for the live weekly test.");
const dir = path.join(process.cwd(), "fixtures", "sample");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const agencyId = commitImport(db, previewImport({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv") }), { isSample: true });
const agency = getAgency(db, agencyId);
const bindings: Partial<CfoBindings> = {};
for (const which of ["Reviewed", "Downside"] as const) {
  const binding: CfoBinding = { scenario: `Headwind ${which} (${label})`, table: `Headwind ${which} cash (${label})`, prefix: `HW ${which}` };
  await ensureScenario(binding.scenario);
  await createCashTable(binding, `Headwind ${which}`, { openingCash: agency.opening_cash_cents / 100, expectedReceipts: 0, recruiterPay: agency.recruiter_pay_cents / 100, otherExpenses: agency.other_expenses_cents / 100 });
  bindings[which === "Reviewed" ? "reviewed" : "downside"] = binding;
}
db.prepare("UPDATE agency SET cfo_binding = ? WHERE id = ?").run(JSON.stringify(bindings), agencyId);

await startTelemetry("weekly-revenue-review");
const started = Date.now();
const runId = enqueueRun(db, agencyId);
const owner = `${os.hostname()}:${process.pid}`;
const run = claimRun(db, owner);
if (!run || run.id !== runId) throw new Error("Couldn't claim the live weekly run.");
const done = await processRun(db, run, owner);
const elapsedMs = Date.now() - started;
await stopTelemetry();

const q = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a);
const out = {
  label, agencyId, runId, status: done.status, error: done.error, traceId: done.trace_id, elapsedMs, usage: JSON.parse(done.usage),
  bindings,
  steps: q("SELECT step, status, output, completed_at FROM review_step WHERE run_id = ? ORDER BY rowid", runId),
  sourceSnapshots: q("SELECT id, client_id, mandate_id, source_type, provenance, source_date, retrieved_at, summary, payload, complete FROM evidence WHERE agency_id = ? ORDER BY source_type, id", agencyId),
  decisions: q("SELECT d.case_id, c.mandate_id, d.selected_outcome, d.support, d.missing_facts, d.evidence_ids, d.assumption_change FROM decision d JOIN case_record c ON c.id = d.case_id WHERE d.run_id = ?", runId),
  tasks: q("SELECT t.question, t.assignee, t.priority_reason, c.mandate_id FROM task t JOIN case_record c ON c.id = t.case_id WHERE t.status = 'open'"),
  forecasts: q("SELECT id, assumptions, intended, readback, verification FROM forecast_version WHERE agency_id = ? ORDER BY created_at", agencyId),
  operations: q("SELECT id, target, status, attempts, result, reconciliation FROM external_operation ORDER BY updated_at"),
};
const file = path.join("eval", "results", `live-weekly-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ file, runId, status: done.status, traceId: done.trace_id, elapsedMs, usage: out.usage }));
