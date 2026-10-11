import type Database from "better-sqlite3";
import { CfoError, readCashTable, rowValues, writeCashInputs, type CashInputs, type CfoBinding, type CfoTableRead } from "./cfo";
import { faultEnabled } from "./faults";
import { sha256, stableId } from "./ids";
import { toolSpan } from "./telemetry";

export interface OperationRow {
  id: string;
  target: string;
  payload_hash: string;
  payload: string;
  status: "intended" | "sent" | "unknown" | "verified" | "mismatch";
  attempts: number;
  result: string | null;
  reconciliation: string | null;
}

export interface SyncResult {
  operationId: string;
  status: "verified";
  how: "written" | "already_applied";
  readback: Record<string, number>;
  changeLogId: string | null;
}

export interface CfoPort {
  read(b: CfoBinding): Promise<CfoTableRead>;
  write(b: CfoBinding, current: CfoTableRead, inputs: CashInputs): Promise<CfoTableRead>;
}

export const liveCfo: CfoPort = { read: readCashTable, write: writeCashInputs };

function matches(read: CfoTableRead, b: CfoBinding, inputs: CashInputs): { ok: boolean; values: Record<string, number> } {
  const v = rowValues(read, b.prefix);
  const expectedClosing = inputs.openingCash + inputs.expectedReceipts - inputs.recruiterPay - inputs.otherExpenses;
  const cents = (n: number | undefined) => (n === undefined ? NaN : Math.round(n * 100));
  const ok =
    cents(v["Opening Cash"]) === cents(inputs.openingCash) &&
    cents(v["Expected Receipts"]) === cents(inputs.expectedReceipts) &&
    cents(v["Recruiter Pay"]) === cents(inputs.recruiterPay) &&
    cents(v["Other Expenses"]) === cents(inputs.otherExpenses) &&
    cents(v["Closing Cash"]) === cents(expectedClosing);
  return { ok, values: v as Record<string, number> };
}

export async function syncScenario(db: Database.Database, forecastVersionId: string, scenario: "Reviewed" | "Downside", binding: CfoBinding, inputs: CashInputs, cfo: CfoPort = liveCfo, guard: () => void = () => {}): Promise<SyncResult> {
  const id = stableId("op", forecastVersionId, scenario);
  const payload = { binding, inputs };
  const hash = sha256(payload);
  db.prepare("INSERT OR IGNORE INTO external_operation (id, target, payload_hash, payload, status) VALUES (?,?,?,?,'intended')").run(id, `cfo.ai:${binding.scenario}:${binding.table}`, hash, JSON.stringify(payload));
  const op = db.prepare("SELECT * FROM external_operation WHERE id = ?").get(id) as OperationRow;
  if (op.payload_hash !== hash) throw new Error(`Operation ${id} already exists with different contents. Refusing to send a second write.`);
  if (op.status === "verified") {
    const r = JSON.parse(op.result ?? "{}") as SyncResult;
    return r;
  }
  const update = (status: OperationRow["status"], fields: { result?: unknown; reconciliation?: string }) =>
    db.prepare("UPDATE external_operation SET status = ?, result = COALESCE(?, result), reconciliation = COALESCE(?, reconciliation), updated_at = datetime('now') WHERE id = ?").run(
      status, fields.result === undefined ? null : JSON.stringify(fields.result), fields.reconciliation ?? null, id
    );

  const current = await toolSpan(`cfo.inspect ${scenario}`, () => cfo.read(binding));
  const before = matches(current, binding, inputs);
  if (before.ok) {
    const result: SyncResult = { operationId: id, status: "verified", how: "already_applied", readback: before.values, changeLogId: current.as_of != null ? String(current.as_of) : null };
    update("verified", { result, reconciliation: op.status === "intended" ? "Target already held the intended values; no write sent." : `Previous attempt ended as "${op.status}"; inspection showed the write had landed, so it was not resent.` });
    return result;
  }
  guard();
  db.prepare("UPDATE external_operation SET status = 'sent', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?").run(id);
  let written: CfoTableRead;
  try {
    written = await toolSpan(`cfo.write ${scenario}`, async () => {
      const r = await cfo.write(binding, current, inputs);
      if (faultEnabled("cfo_timeout_after_write")) throw new CfoError("cfo.ai did not answer in time (injected after the write)", "timeout");
      return r;
    });
  } catch (e) {
    if (e instanceof CfoError && (e.kind === "timeout" || e.kind === "transport")) {
      update("unknown", { reconciliation: `Write outcome unknown (${e.message}). Next attempt inspects cfo.ai before sending anything.` });
    } else {
      update("intended", { reconciliation: `Write refused: ${e instanceof Error ? e.message : String(e)}` });
    }
    throw e;
  }
  const readback = await toolSpan(`cfo.readback ${scenario}`, () => cfo.read(binding));
  const after = matches(readback, binding, inputs);
  if (!after.ok) {
    update("mismatch", { result: { readback: after.values }, reconciliation: "Readback didn't match the intended values." });
    throw new Error(`cfo.ai ${scenario} readback didn't match what Headwind wrote.`);
  }
  const result: SyncResult = { operationId: id, status: "verified", how: "written", readback: after.values, changeLogId: written.change_log_id != null ? String(written.change_log_id) : null };
  update("verified", { result, reconciliation: "Readback matched the intended values." });
  return result;
}
