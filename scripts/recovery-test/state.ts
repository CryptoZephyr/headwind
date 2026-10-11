import "../../lib/env";
import { getDb } from "../../lib/db";
import { callTool } from "../../lib/cfo";
const db = getDb();
const run = db.prepare("SELECT id, kind, status, step, attempts, error, lease_owner, usage FROM review_run ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown>;
console.log(JSON.stringify({ run, steps: db.prepare("SELECT step, status, completed_at FROM review_step WHERE run_id = ? ORDER BY rowid").all(run.id), ops: db.prepare("SELECT id, target, status, attempts, reconciliation FROM external_operation WHERE id IN (SELECT id FROM external_operation ORDER BY updated_at DESC LIMIT 2)").all(), decisionsThisRun: db.prepare("SELECT COUNT(*) n FROM decision WHERE run_id = ?").get(run.id) }, null, 1));
if (process.argv[2] === "cfo") {
  const b = JSON.parse((db.prepare("SELECT cfo_binding FROM agency").get() as { cfo_binding: string }).cfo_binding);
  for (const s of [b.reviewed, b.downside]) console.log(s.scenario, JSON.stringify(await callTool("inspect_history", { changelog: { scenario: s.scenario, limit: 10 } })).slice(0, 1500));
}
