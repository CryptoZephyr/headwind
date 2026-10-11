import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CfoError, type CashInputs, type CfoBinding, type CfoTableRead } from "../lib/cfo";
import { closeDb, getDb, migrate } from "../lib/db";
import { previewImport } from "../lib/importer";
import { recordClientReply, type ReplyReader } from "../lib/reply";
import { ModelOutputError } from "../lib/llm";
import { claimRun, enqueueRun, scheduleWeekly, getRun, LeaseLostError, processRun, RetryBlockedError, retryRun, SimulatedCrash, type Ports } from "../lib/review";
import { commitImport } from "../lib/store";

delete process.env.NEATLOGS_API_KEY;
process.env.HEADWIND_DB = ":memory:";

const dir = path.join(__dirname, "..", "fixtures", "sample");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

class FakeCfo {
  tables = new Map<string, Record<string, number>>();
  writes = 0;
  timeoutAfterNextWrite = false;
  async read(b: CfoBinding): Promise<CfoTableRead> {
    const t = this.tables.get(b.scenario) ?? { "Opening Cash": 0, "Expected Receipts": 0, "Recruiter Pay": 0, "Other Expenses": 0 };
    const closing = t["Opening Cash"] + t["Expected Receipts"] - t["Recruiter Pay"] - t["Other Expenses"];
    const rows = Object.entries({ ...t, "Closing Cash": closing }).map(([k, v]) => ({ ref: `${b.prefix} ${k}#x`, display_name: `${b.prefix} ${k}`, values: [v] }));
    return { rows, as_of: this.writes };
  }
  async write(b: CfoBinding, _c: CfoTableRead, i: CashInputs): Promise<CfoTableRead> {
    this.writes++;
    this.tables.set(b.scenario, { "Opening Cash": i.openingCash, "Expected Receipts": i.expectedReceipts, "Recruiter Pay": i.recruiterPay, "Other Expenses": i.otherExpenses });
    if (this.timeoutAfterNextWrite) {
      this.timeoutAfterNextWrite = false;
      throw new CfoError("cfo.ai did not answer in time", "timeout");
    }
    return { ...(await this.read(b)), change_log_id: this.writes };
  }
}

function ports(cfo: FakeCfo): Ports {
  return {
    fetchCompany: async (domain) => ({ candidates: [{ companyId: `co-${domain}`, name: domain, primaryDomain: domain, confidence: 1 }], openingsCount: 5, recentTitles: [], timeseries: [], raw: {}, credits: 2 }),
    fetchListings: async () => ({ listings: [], totalCount: 0, complete: true, filters: {}, credits: 0 }),
    draftCaseNote: async (i) => ({ note: { summary: `Needs confirmation: ${i.missing.join(" ")}`, question: `Is the ${i.roleTitle} role still open?`, evidence_ids: [i.evidence[0].id] }, tokens: 10, calls: 1 }),
    cfo,
  };
}

const pauseReader: ReplyReader = async ({ body }) => ({ read: { outcome: "client_pause", paused_until: "2027-02-01", quote: body.slice(0, 40) }, tokens: 5 });

function setup() {
  closeDb();
  const db = getDb();
  const agencyId = commitImport(db, previewImport({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv") }), { isSample: true });
  const binding = (w: string) => ({ scenario: `S ${w}`, table: `T ${w}`, prefix: `HW ${w}` });
  db.prepare("UPDATE agency SET cfo_binding = ? WHERE id = ?").run(JSON.stringify({ reviewed: binding("Reviewed"), downside: binding("Downside") }), agencyId);
  return { db, agencyId };
}

async function drain(db: ReturnType<typeof getDb>, p: Ports) {
  for (let i = 0; i < 10; i++) {
    const run = claimRun(db, "w1");
    if (!run) return;
    await processRun(db, run, "w1", p);
  }
}

describe("review engine", () => {
  let cfo: FakeCfo;
  beforeEach(() => { cfo = new FakeCfo(); });

  it("runs the sample journey: review, client reply, reassessment", async () => {
    const { db, agencyId } = setup();
    const runId = enqueueRun(db, agencyId);
    await drain(db, ports(cfo));
    expect(getRun(db, runId).status).toBe("complete");
    const outcomes = Object.fromEntries((db.prepare("SELECT mandate_id, outcome FROM case_record").all() as { mandate_id: string; outcome: string }[]).map((r) => [r.mandate_id, r.outcome]));
    expect(outcomes).toEqual({ "M-101": "offer_accepted", "M-102": "unknown", "M-103": "unknown" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM task WHERE status = 'open'").get()).toEqual({ n: 2 });
    expect(cfo.tables.get("S Reviewed")?.["Expected Receipts"]).toBe(17000);
    expect(cfo.tables.get("S Downside")?.["Expected Receipts"]).toBe(8000);

    const caseId = (db.prepare("SELECT id FROM case_record WHERE mandate_id = 'M-102'").get() as { id: string }).id;
    const reply = { caseId, replyDate: "2026-10-12", source: "Client email (simulated)", body: read("reply-M-102.txt"), isSimulated: true };
    const first = await recordClientReply(db, reply, pauseReader);
    const again = await recordClientReply(db, reply, pauseReader);
    expect(again.duplicate).toBe(true);
    expect(again.runId).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM client_reply").get()).toEqual({ n: 1 });
    await drain(db, ports(cfo));
    expect(getRun(db, first.runId!).status).toBe("complete");
    expect(cfo.tables.get("S Reviewed")?.["Expected Receipts"]).toBe(12000);
    expect(cfo.tables.get("S Downside")?.["Expected Receipts"]).toBe(8000);
    const history = db.prepare("SELECT case_version, selected_outcome FROM decision WHERE case_id = ? ORDER BY case_version").all(caseId);
    expect(history).toEqual([{ case_version: 1, selected_outcome: "unknown" }, { case_version: 2, selected_outcome: "client_pause" }]);
    expect(db.prepare("SELECT status FROM task WHERE case_id = ?").all(caseId)).toEqual([{ status: "answered" }]);
  });

  it("resumes after a crash without repeating finished steps or evidence fetches", async () => {
    const { db, agencyId } = setup();
    const p = ports(cfo);
    let companyCalls = 0;
    const counting: Ports = { ...p, fetchCompany: async (d) => { companyCalls++; return p.fetchCompany(d); } };
    const runId = enqueueRun(db, agencyId);
    const run = claimRun(db, "w1")!;
    await expect(processRun(db, run, "w1", counting, { crashAfterStep: "assess" })).rejects.toBeInstanceOf(SimulatedCrash);
    expect(claimRun(db, "w2")).toBeNull();
    db.prepare("UPDATE review_run SET lease_expires_at = datetime('now', '-1 seconds') WHERE id = ?").run(runId);
    const resumed = claimRun(db, "w2")!;
    expect(resumed.step).toBe("assess");
    await processRun(db, resumed, "w2", counting);
    expect(getRun(db, runId).status).toBe("complete");
    expect(companyCalls).toBe(3);
    expect(db.prepare("SELECT COUNT(*) AS n FROM decision").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM task").get()).toEqual({ n: 2 });
  });

  it("reconciles a cfo.ai write that timed out after landing instead of resending", async () => {
    const { db, agencyId } = setup();
    cfo.timeoutAfterNextWrite = true;
    const runId = enqueueRun(db, agencyId);
    await processRun(db, claimRun(db, "w1")!, "w1", ports(cfo));
    expect(getRun(db, runId).status).toBe("retrying");
    const op = db.prepare("SELECT status FROM external_operation WHERE id LIKE 'op_%' ORDER BY updated_at LIMIT 1").get() as { status: string };
    expect(op.status).toBe("unknown");
    db.prepare("UPDATE review_run SET available_at = NULL WHERE id = ?").run(runId);
    await drain(db, ports(cfo));
    expect(getRun(db, runId).status).toBe("complete");
    expect(cfo.writes).toBe(2);
    const ops = db.prepare("SELECT status, reconciliation FROM external_operation ORDER BY id").all() as { status: string; reconciliation: string }[];
    expect(ops.every((o) => o.status === "verified")).toBe(true);
    expect(ops.some((o) => o.reconciliation.includes("not resent"))).toBe(true);
  });

  it("falls back to deterministic note when draftCaseNote always throws ModelOutputError", async () => {
    const { db, agencyId } = setup();
    const rejectedText = "The role was paused last week.";
    const failingPorts: Ports = {
      ...ports(cfo),
      draftCaseNote: async () => { throw new ModelOutputError("The model's summary claimed an outcome the evidence doesn't confirm.", rejectedText); },
    };
    const runId = enqueueRun(db, agencyId);
    await drain(db, failingPorts);
    expect(getRun(db, runId).status).toBe("complete");
    const tasks = db.prepare("SELECT COUNT(*) AS n FROM task WHERE status = 'open'").get() as { n: number };
    expect(tasks.n).toBe(2);
    const decisions = db.prepare("SELECT missing_facts FROM decision").all() as { missing_facts: string }[];
    const withRejection = decisions.filter((d) => d.missing_facts.includes("Model note rejected:"));
    expect(withRejection.length).toBeGreaterThanOrEqual(2);
  });

  it("blocks ambiguous company matches and gives up after bounded retries", async () => {
    const { db, agencyId } = setup();
    const p = ports(cfo);
    const ambiguous: Ports = { ...p, fetchCompany: async (d) => ({ ...(await p.fetchCompany(d)), candidates: [{ companyId: "1", name: "A", primaryDomain: "other.com", confidence: 0.6 }, { companyId: "2", name: "B", primaryDomain: "else.com", confidence: 0.5 }] }) };
    const runId = enqueueRun(db, agencyId);
    await drain(db, ambiguous);
    expect(db.prepare("SELECT DISTINCT match_status FROM client").all()).toEqual([{ match_status: "ambiguous" }]);
    expect(getRun(db, runId).status).toBe("complete");

    const { db: db2, agencyId: a2 } = setup();
    const broken: Ports = { ...p, cfo: { read: async () => { throw new CfoError("cfo.ai returned HTTP 503", "transport"); }, write: p.cfo.write } };
    const r2 = enqueueRun(db2, a2);
    for (let i = 0; i < 5; i++) {
      db2.prepare("UPDATE review_run SET available_at = NULL WHERE id = ?").run(r2);
      const run = claimRun(db2, "w1");
      if (!run) break;
      await processRun(db2, run, "w1", broken);
    }
    const final = getRun(db2, r2);
    expect(final.status).toBe("partial");
    expect(final.attempts).toBe(3);
    expect(final.error).toContain("sync_cfo");

    const recovered = new FakeCfo();
    expect(retryRun(db2, r2)).toBe(true);
    expect(retryRun(db2, r2)).toBe(false);
    await drain(db2, ports(recovered));
    expect(getRun(db2, r2).status).toBe("complete");
    expect(recovered.writes).toBe(2);
    expect(db2.prepare("SELECT COUNT(*) AS n FROM decision").get()).toEqual({ n: 3 });
  });

  it("queues a fresh reassessment for a reply that arrives after an active review has assessed", async () => {
    const { db, agencyId } = setup();
    const weekly = enqueueRun(db, agencyId);
    const run = claimRun(db, "w1")!;
    await expect(processRun(db, run, "w1", ports(cfo), { crashAfterStep: "assess" })).rejects.toBeInstanceOf(SimulatedCrash);
    const caseId = (db.prepare("SELECT id FROM case_record WHERE mandate_id = 'M-102'").get() as { id: string }).id;
    const r = await recordClientReply(db, { caseId, replyDate: "2026-10-12", source: "Client email (simulated)", body: read("reply-M-102.txt"), isSimulated: true }, pauseReader);
    expect(r.runId).not.toBe(weekly);
    expect(claimRun(db, "w2")).toBeNull();
    db.prepare("UPDATE review_run SET lease_expires_at = datetime('now', '-1 seconds') WHERE id = ?").run(weekly);
    await drain(db, ports(cfo));
    expect(getRun(db, weekly).status).toBe("complete");
    expect(getRun(db, r.runId!).status).toBe("complete");
    expect((db.prepare("SELECT outcome FROM case_record WHERE id = ?").get(caseId) as { outcome: string }).outcome).toBe("client_pause");
    expect(cfo.tables.get("S Reviewed")?.["Expected Receipts"]).toBe(12000);
  });

  it("treats each import as the agency's current book: omitted mandates and old notes drop out", async () => {
    const { db, agencyId } = setup();
    const mandatesCsv = read("mandates.csv").split("\n").filter((l) => !l.startsWith("M-103")).join("\n").replace("Two candidates at final interview (sample)", "Offer withdrawn (sample)");
    commitImport(db, previewImport({ clients: read("clients.csv"), mandates: mandatesCsv, finance: read("finance.csv"), updates: "" }), { isSample: true });
    expect(db.prepare("SELECT id FROM mandate ORDER BY id").all()).toEqual([{ id: "M-101" }, { id: "M-102" }]);
    const runId = enqueueRun(db, agencyId);
    await drain(db, ports(cfo));
    expect(getRun(db, runId).status).toBe("complete");
    expect(cfo.tables.get("S Reviewed")?.["Expected Receipts"]).toBe(13000);
    const notes = (db.prepare("SELECT summary FROM evidence WHERE mandate_id = 'M-102' AND source_type = 'candidate_record' AND retired_at IS NULL").all() as { summary: string }[]).map((e) => e.summary);
    expect(notes).toEqual(["Agency record (final_interview): Offer withdrawn (sample)"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM evidence WHERE source_type = 'candidate_record' AND retired_at IS NOT NULL").get()).toEqual({ n: 2 });
  });

  it("won't retry an old review while another review for the agency is in progress", async () => {
    const { db, agencyId } = setup();
    const broken: Ports = { ...ports(cfo), cfo: { read: async () => { throw new CfoError("cfo.ai returned HTTP 503", "transport"); }, write: cfo.write } };
    const old = enqueueRun(db, agencyId);
    for (let i = 0; i < 3; i++) {
      db.prepare("UPDATE review_run SET available_at = NULL WHERE id = ?").run(old);
      await processRun(db, claimRun(db, "w1")!, "w1", broken);
    }
    expect(getRun(db, old).status).toBe("partial");
    const newer = enqueueRun(db, agencyId);
    expect(newer).not.toBe(old);
    expect(() => retryRun(db, old)).toThrow(RetryBlockedError);
    expect(getRun(db, old).status).toBe("partial");
  });

  it("stops before writing to cfo.ai when another worker has taken over the review", async () => {
    const { db, agencyId } = setup();
    const runId = enqueueRun(db, agencyId);
    const run = claimRun(db, "w1")!;
    const stealing: Ports = { ...ports(cfo), cfo: { read: async (b) => { db.prepare("UPDATE review_run SET lease_owner = 'w2' WHERE id = ?").run(runId); return cfo.read(b); }, write: (b, c, i) => cfo.write(b, c, i) } };
    await expect(processRun(db, run, "w1", stealing)).rejects.toBeInstanceOf(LeaseLostError);
    expect(cfo.writes).toBe(0);
  });

  it("a reply reassesses only its own case", async () => {
    const { db, agencyId } = setup();
    enqueueRun(db, agencyId);
    await drain(db, ports(cfo));
    const before = db.prepare("SELECT mandate_id, version FROM case_record ORDER BY mandate_id").all();
    const tasksBefore = db.prepare("SELECT id, status FROM task WHERE case_id NOT IN (SELECT id FROM case_record WHERE mandate_id = 'M-102') ORDER BY id").all();
    const caseId = (db.prepare("SELECT id FROM case_record WHERE mandate_id = 'M-102'").get() as { id: string }).id;
    const r = await recordClientReply(db, { caseId, replyDate: "2026-10-12", source: "Client email (simulated)", body: read("reply-M-102.txt"), isSimulated: true }, pauseReader);
    await drain(db, ports(cfo));
    expect(getRun(db, r.runId!).status).toBe("complete");
    expect(db.prepare("SELECT mandate_id, version FROM case_record ORDER BY mandate_id").all()).toEqual(
      (before as { mandate_id: string; version: number }[]).map((c) => (c.mandate_id === "M-102" ? { ...c, version: c.version + 1 } : c))
    );
    expect(db.prepare("SELECT id, status FROM task WHERE case_id NOT IN (SELECT id FROM case_record WHERE mandate_id = 'M-102') ORDER BY id").all()).toEqual(tasksBefore);
  });

  it("a reply that arrives while its case is being assessed is picked up by the next reassessment", async () => {
    const { db, agencyId } = setup();
    enqueueRun(db, agencyId);
    let sent = false;
    const p = ports(cfo);
    const racing: Ports = {
      ...p,
      draftCaseNote: async (input) => {
        if (!sent && input.roleTitle.startsWith("Product Engineer")) {
          sent = true;
          const id = (db.prepare("SELECT id FROM case_record WHERE mandate_id = 'M-102'").get() as { id: string }).id;
          await recordClientReply(db, { caseId: id, replyDate: "2026-10-12", source: "Client email (simulated)", body: read("reply-M-102.txt"), isSimulated: true }, pauseReader);
        }
        return p.draftCaseNote(input);
      },
    };
    await drain(db, racing);
    expect(sent).toBe(true);
    expect((db.prepare("SELECT outcome FROM case_record WHERE mandate_id = 'M-102'").get() as { outcome: string }).outcome).toBe("client_pause");
    expect(cfo.tables.get("S Reviewed")?.["Expected Receipts"]).toBe(12000);
  });

  it("migration leaves a reply that no decision has used yet pending", async () => {
    const { db, agencyId } = setup();
    enqueueRun(db, agencyId);
    await drain(db, ports(cfo));
    const caseId = (db.prepare("SELECT id FROM case_record WHERE mandate_id = 'M-102'").get() as { id: string }).id;
    await recordClientReply(db, { caseId, replyDate: "2026-10-12", source: "Client email (simulated)", body: read("reply-M-102.txt"), isSimulated: true }, pauseReader);
    db.prepare("UPDATE client_reply SET created_at = datetime('now', '+1 minute')").run();
    db.exec("ALTER TABLE client_reply DROP COLUMN assessed_at");
    migrate(db);
    expect(db.prepare("SELECT assessed_at FROM client_reply").get()).toEqual({ assessed_at: null });
    await drain(db, ports(cfo));
    expect((db.prepare("SELECT outcome FROM case_record WHERE id = ?").get(caseId) as { outcome: string }).outcome).toBe("client_pause");
  });

  it("re-importing an unchanged note under a new stage refreshes the evidence", () => {
    const { db } = setup();
    const mandatesCsv = read("mandates.csv").replace(",final_interview,50%", ",offer_accepted,50%");
    commitImport(db, previewImport({ clients: read("clients.csv"), mandates: mandatesCsv, finance: read("finance.csv"), updates: "" }), { isSample: true });
    const notes = db.prepare("SELECT summary FROM evidence WHERE mandate_id = 'M-102' AND source_type = 'candidate_record' AND retired_at IS NULL").all();
    expect(notes).toEqual([{ summary: "Agency record (offer_accepted): Two candidates at final interview (sample)" }]);
  });

  it("the weekly timer queues a weekly review behind a waiting reassessment", () => {
    const { db, agencyId } = setup();
    const reassess = enqueueRun(db, agencyId, "reassess");
    const [r] = scheduleWeekly(db, "2026-10-12");
    expect(r.runId).not.toBe(reassess);
    expect(getRun(db, r.runId!)?.kind).toBe("weekly");
  });

  it("the weekly timer skips an agency whose finance period has ended", () => {
    const { db, agencyId } = setup();
    const [r] = scheduleWeekly(db, "2026-12-07");
    expect(r).toMatchObject({ agencyId, runId: null });
    expect(r.skipped).toContain("2026-11-30");
    expect(db.prepare("SELECT COUNT(*) AS n FROM review_run").get()).toEqual({ n: 0 });
  });
});

describe("decision cases (controlled replay of the 10 evaluation cases)", () => {
  type Db = ReturnType<typeof getDb>;
  let cfo: FakeCfo;
  beforeEach(() => { cfo = new FakeCfo(); });
  const caseOf = (db: Db, m: string) => (db.prepare("SELECT id FROM case_record WHERE mandate_id = ?").get(m) as { id: string }).id;
  const latest = (db: Db, m: string) => {
    const d = db.prepare("SELECT d.selected_outcome AS outcome, d.missing_facts AS missing FROM decision d JOIN case_record c ON c.id = d.case_id WHERE c.mandate_id = ? ORDER BY d.case_version DESC LIMIT 1").get(m) as { outcome: string; missing: string };
    return { outcome: d.outcome, missing: JSON.parse(d.missing) as string[] };
  };
  const openTasks = (db: Db, m: string) => (db.prepare("SELECT COUNT(*) AS n FROM task t JOIN case_record c ON c.id = t.case_id WHERE c.mandate_id = ? AND t.status = 'open'").get(m) as { n: number }).n;
  const receipts = (w: string) => cfo.tables.get(`S ${w}`)!["Expected Receipts"];
  const reader = (outcome: "client_pause" | "still_active", pausedUntil: string | null = null): ReplyReader => async ({ body }) => ({ read: { outcome, paused_until: pausedUntil, quote: body.slice(0, 40) }, tokens: 5 });
  const listingFor = (title: string): Ports["fetchListings"] => async () => ({ listings: [{ title, url: "https://example.com/jobs/2", location: null, dateAdded: "2026-10-01" }], totalCount: 1, complete: true, filters: {}, credits: 1 });

  async function weekly(p: Ports = ports(cfo)) {
    const { db, agencyId } = setup();
    enqueueRun(db, agencyId);
    await drain(db, p);
    return { db, agencyId, p };
  }

  it("1. listing absent, offer accepted: keeps the fee assumption, no task", async () => {
    const { db } = await weekly();
    expect(latest(db, "M-101").outcome).toBe("offer_accepted");
    expect(openTasks(db, "M-101")).toBe(0);
    expect(receipts("Reviewed")).toBe(17000);
  });

  it("2. dated client pause confirmed: removes the receipt from the horizon", async () => {
    const { db, p } = await weekly();
    await recordClientReply(db, { caseId: caseOf(db, "M-102"), replyDate: "2026-10-11", source: "email", body: "Paused until February.", isSimulated: true }, reader("client_pause", "2027-02-01"));
    await drain(db, p);
    expect(latest(db, "M-102").outcome).toBe("client_pause");
    expect(receipts("Reviewed")).toBe(12000);
  });

  it("3. listing absent, outcome unknown: opens a confirmation task and a downside", async () => {
    const { db } = await weekly();
    expect(latest(db, "M-103").outcome).toBe("unknown");
    expect(latest(db, "M-103").missing.join(" ")).toContain("not found");
    expect(openTasks(db, "M-103")).toBe(1);
    expect(receipts("Downside")).toBe(8000);
  });

  it("4. role reposted under a new listing: links it and claims no pause", async () => {
    const { db } = await weekly({ ...ports(cfo), fetchListings: listingFor("Staff Billing Platform Engineer (sample) - Remote") });
    const ev = db.prepare("SELECT summary FROM evidence WHERE mandate_id = 'M-103' AND source_type = 'listing_check'").get() as { summary: string };
    expect(ev.summary).toContain("still lists");
    expect(latest(db, "M-103").outcome).not.toBe("client_pause");
    expect(latest(db, "M-103").missing.join(" ")).not.toContain("not found");
  });

  it("5. company match is ambiguous: blocks the match and takes no financial action", async () => {
    const p = ports(cfo);
    const { db } = await weekly({ ...p, fetchCompany: async (d) => ({ ...(await p.fetchCompany(d)), candidates: [{ companyId: "1", name: "A", primaryDomain: "other.com", confidence: 0.6 }, { companyId: "2", name: "B", primaryDomain: "else.com", confidence: 0.5 }] }) });
    expect(db.prepare("SELECT DISTINCT match_status FROM client").all()).toEqual([{ match_status: "ambiguous" }]);
    const step = db.prepare("SELECT output FROM review_step WHERE step = 'check_listings'").get() as { output: string };
    expect(JSON.parse(step.output)["M-103"]).toBe("blocked_by_match");
    expect(receipts("Reviewed")).toBe(17000);
  });

  it("6. provider response incomplete: marks it unchecked and claims no disappearance", async () => {
    const { db } = await weekly({ ...ports(cfo), fetchListings: async () => ({ listings: [], totalCount: null, complete: false, filters: {}, credits: 1 }) });
    const missing = latest(db, "M-103").missing.join(" ");
    expect(missing).toContain("didn't finish");
    expect(missing).not.toContain("not found");
    expect(openTasks(db, "M-103")).toBe(1);
  });

  it("7. no earlier listing snapshot: claims no removal", async () => {
    const { db } = await weekly();
    const step = db.prepare("SELECT output FROM review_step WHERE step = 'check_listings'").get() as { output: string };
    expect(JSON.parse(step.output)["M-102"]).toBe("not_checked");
    expect(latest(db, "M-102").missing.join(" ")).not.toContain("listing");
  });

  it("8. company-wide decline but the client confirms the role: role-specific evidence wins, both kept", async () => {
    const p = ports(cfo);
    const declining: Ports = { ...p, fetchCompany: async (d) => ({ ...(await p.fetchCompany(d)), timeseries: [{ date: "2026-07-01", openJobs: 50 }, { date: "2026-10-01", openJobs: 10 }] }) };
    const { db } = await weekly(declining);
    await recordClientReply(db, { caseId: caseOf(db, "M-102"), replyDate: "2026-10-11", source: "email", body: "Still hiring for this role.", isSimulated: true }, reader("still_active"));
    await drain(db, declining);
    expect(latest(db, "M-102").outcome).toBe("unreviewed");
    expect(openTasks(db, "M-102")).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM evidence WHERE source_type = 'company_snapshot' AND summary LIKE '%50 on 2026-07-01%'").get() as { n: number }).n).toBeGreaterThan(0);
    expect(receipts("Reviewed")).toBe(17000);
  });

  it("9. a later reply contradicts the earlier decision: reassesses, keeps history, updates the scenario", async () => {
    const { db, p } = await weekly();
    const id = caseOf(db, "M-102");
    await recordClientReply(db, { caseId: id, replyDate: "2026-10-11", source: "email", body: "Paused until February.", isSimulated: true }, reader("client_pause", "2027-02-01"));
    await drain(db, p);
    expect(receipts("Reviewed")).toBe(12000);
    await recordClientReply(db, { caseId: id, replyDate: "2026-10-12", source: "email", body: "Budget came back, we're hiring again.", isSimulated: true }, reader("still_active"));
    await drain(db, p);
    expect(latest(db, "M-102").outcome).toBe("unreviewed");
    expect(db.prepare("SELECT selected_outcome FROM decision WHERE case_id = ? ORDER BY case_version").all(id).map((r) => (r as { selected_outcome: string }).selected_outcome)).toEqual(["unknown", "client_pause", "unreviewed"]);
    expect(receipts("Reviewed")).toBe(17000);
  });

  it("10. duplicate reply and concurrent rerun: one task outcome and one financial result", async () => {
    const { db, agencyId, p } = await weekly();
    const id = caseOf(db, "M-102");
    const reply = { caseId: id, replyDate: "2026-10-11", source: "email", body: "Paused until February.", isSimulated: true };
    await recordClientReply(db, reply, reader("client_pause", "2027-02-01"));
    const again = await recordClientReply(db, reply, reader("client_pause", "2027-02-01"));
    expect(again.duplicate).toBe(true);
    expect(again.runId).toBeNull();
    const writesBefore = cfo.writes;
    const run = claimRun(db, "w1")!;
    expect(claimRun(db, "w2")).toBeNull();
    await processRun(db, run, "w1", p);
    enqueueRun(db, agencyId, "reassess");
    await drain(db, p);
    expect(cfo.writes - writesBefore).toBe(1);
    expect(receipts("Reviewed")).toBe(12000);
    expect((db.prepare("SELECT COUNT(*) AS n FROM client_reply WHERE case_id = ?").get(id) as { n: number }).n).toBe(1);
  });
});
