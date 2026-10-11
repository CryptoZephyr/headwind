import type Database from "better-sqlite3";
import type { ScenarioResult } from "./scenarios";
import type { RunRow } from "./review";
import type { AgencyRow, CfoBindings, EvidenceRecord } from "./store";
import { OUTCOME_LABEL } from "./format";
import { withoutRepeats } from "./store";

export interface CaseView {
  id: string;
  mandateId: string;
  roleTitle: string;
  clientName: string;
  matchStatus: string;
  feeCents: number;
  probabilityBps: number;
  expectedTriggerDate: string;
  state: string;
  outcome: string | null;
  pausedUntil: string | null;
  summary: string | null;
  version: number;
  decisions: { version: number; outcome: string; support: string; missing: string[]; assumptionChange: string; createdAt: string }[];
  openTask: { id: string; question: string; assignee: string | null; reason: string; due: string | null } | null;
  replies: { id: string; date: string; source: string; body: string; simulated: boolean; reading: string | null }[];
  evidence: EvidenceRecord[];
  listingHistory: string | null;
}

export interface Overview {
  agency: AgencyRow;
  cfo: CfoBindings | null;
  runs: (RunRow & { steps: { step: string; status: string; completed_at: string | null }[] })[];
  cases: CaseView[];
  forecast: { runId: string; createdAt: string; intended: { original: ScenarioResult; reviewed: ScenarioResult; downside: ScenarioResult }; verification: string; readback: Record<string, { how: string; changeLogId: string | null; readback: Record<string, number> }> | null } | null;
}

export function overview(db: Database.Database): Overview | null {
  const agency = db.prepare("SELECT * FROM agency ORDER BY is_sample DESC, name LIMIT 1").get() as AgencyRow | undefined;
  if (!agency) return null;
  const runs = (db.prepare("SELECT * FROM review_run WHERE agency_id = ? ORDER BY created_at DESC LIMIT 5").all(agency.id) as RunRow[]).map((r) => ({
    ...r,
    steps: db.prepare("SELECT step, status, completed_at FROM review_step WHERE run_id = ?").all(r.id) as { step: string; status: string; completed_at: string | null }[],
  }));
  const rows = db.prepare(
    `SELECT c.*, m.role_title, m.fee_cents, m.probability_bps, m.expected_trigger_date, m.client_id, cl.name AS client_name, cl.match_status
     FROM case_record c JOIN mandate m ON m.agency_id = c.agency_id AND m.id = c.mandate_id JOIN client cl ON cl.id = m.client_id
     WHERE c.agency_id = ? ORDER BY c.mandate_id`
  ).all(agency.id) as Record<string, unknown>[];
  const cases: CaseView[] = rows.map((r) => {
    const id = r.id as string;
    const evidence = db.prepare("SELECT * FROM evidence WHERE agency_id = ? AND retired_at IS NULL AND (mandate_id = ? OR (mandate_id IS NULL AND client_id = ?)) ORDER BY retrieved_at DESC").all(agency.id, r.mandate_id, r.client_id) as EvidenceRecord[];
    const task = db.prepare("SELECT * FROM task WHERE case_id = ? AND status = 'open' ORDER BY case_version DESC LIMIT 1").get(id) as Record<string, string | null> | undefined;
    return {
      id, mandateId: r.mandate_id as string, roleTitle: r.role_title as string, clientName: r.client_name as string, matchStatus: r.match_status as string,
      feeCents: r.fee_cents as number, probabilityBps: r.probability_bps as number, expectedTriggerDate: r.expected_trigger_date as string,
      state: r.state as string, outcome: r.outcome as string | null, pausedUntil: r.paused_until as string | null, summary: r.summary as string | null, version: r.version as number,
      decisions: (db.prepare("SELECT * FROM decision WHERE case_id = ? ORDER BY case_version DESC").all(id) as Record<string, string | number>[]).map((d) => ({
        version: d.case_version as number, outcome: d.selected_outcome as string, support: d.support as string, missing: JSON.parse(d.missing_facts as string) as string[], assumptionChange: d.assumption_change as string, createdAt: d.created_at as string,
      })),
      openTask: task ? { id: task.id!, question: task.question!, assignee: task.assignee, reason: task.priority_reason!, due: task.due_date } : null,
      replies: (db.prepare("SELECT * FROM client_reply WHERE case_id = ? ORDER BY reply_date DESC").all(id) as Record<string, string | number | null>[]).map((x) => ({
        id: x.id as string, date: x.reply_date as string, source: x.source as string, body: x.body as string, simulated: x.is_simulated === 1, reading: readReply(x.interpretation as string | null),
      })),
      evidence: withoutRepeats(evidence),
      listingHistory: listingHistory(evidence),
    };
  });
  const fv = db.prepare("SELECT * FROM forecast_version WHERE agency_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(agency.id) as Record<string, string | null> | undefined;
  return {
    agency,
    cfo: agency.cfo_binding ? (JSON.parse(agency.cfo_binding) as CfoBindings) : null,
    runs,
    cases,
    forecast: fv ? { runId: fv.run_id!, createdAt: fv.created_at!, intended: JSON.parse(fv.intended!), verification: fv.verification ?? "pending", readback: fv.readback ? JSON.parse(fv.readback) : null } : null,
  };
}

function listingHistory(evidence: EvidenceRecord[]): string | null {
  const agencySeen = evidence.find((e) => e.source_type === "listing_baseline");
  const checks = evidence.filter((e) => e.source_type === "listing_check");
  const first = checks.at(-1);
  if (agencySeen) return `Role listing history: agency saw the listing on ${agencySeen.source_date}; ${checks.length} Crustdata check${checks.length === 1 ? "" : "s"} since.`;
  if (!first) return "Role listing history: not available. No listing check has run yet.";
  const status = (JSON.parse(first.payload) as { status?: string }).status;
  if (status !== "baseline_found" && status !== "baseline_absent") return null;
  return `Role listing history: not available before ${first.source_date}. Crustdata gives no earlier history for this role, so the ${first.source_date} check is only a starting point (${status === "baseline_found" ? "listed" : "no matching listing"}); later checks compare against it.`;
}

function readReply(raw: string | null): string | null {
  if (!raw) return null;
  const r = JSON.parse(raw) as { outcome: string; paused_until?: string | null };
  const label = OUTCOME_LABEL[r.outcome] ?? r.outcome;
  return r.paused_until ? `${label} until ${r.paused_until}` : label;
}
