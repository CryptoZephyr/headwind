import type Database from "better-sqlite3";
import { sha256, stableId } from "./ids";
import { readClientReply } from "./llm";
import { enqueueRun } from "./review";
import { toolSpan } from "./telemetry";

export interface ReplyInput {
  caseId: string;
  replyDate: string;
  source: string;
  body: string;
  isSimulated: boolean;
}

export interface ReplyOutcome {
  replyId: string;
  duplicate: boolean;
  interpretation: { outcome: string; paused_until: string | null; quote: string } | null;
  runId: string | null;
}

export type ReplyReader = typeof readClientReply;

export async function recordClientReply(db: Database.Database, input: ReplyInput, reader: ReplyReader = readClientReply): Promise<ReplyOutcome> {
  const body = input.body.trim();
  if (!body) throw new Error("The reply is empty.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.replyDate)) throw new Error("Reply date must be YYYY-MM-DD.");
  const c = db.prepare("SELECT c.id, c.agency_id, m.role_title FROM case_record c JOIN mandate m ON m.agency_id = c.agency_id AND m.id = c.mandate_id WHERE c.id = ?").get(input.caseId) as
    | { id: string; agency_id: string; role_title: string }
    | undefined;
  if (!c) throw new Error("That case doesn't exist.");
  const hash = sha256(body.replace(/\s+/g, " ").toLowerCase());
  const existing = db.prepare("SELECT id, interpretation FROM client_reply WHERE case_id = ? AND content_hash = ?").get(c.id, hash) as { id: string; interpretation: string | null } | undefined;
  const replyId = existing?.id ?? stableId("reply", c.id, hash);
  if (!existing) {
    db.prepare("INSERT INTO client_reply (id, case_id, reply_date, source, body, is_simulated, content_hash) VALUES (?,?,?,?,?,?,?)").run(replyId, c.id, input.replyDate, input.source, body, input.isSimulated ? 1 : 0, hash);
  } else if (existing.interpretation) {
    return { replyId, duplicate: true, interpretation: JSON.parse(existing.interpretation), runId: null };
  }
  const { read } = await toolSpan("model.read_client_reply", () => reader({ roleTitle: c.role_title, replyDate: input.replyDate, body }));
  const runId = db.transaction(() => {
    db.prepare("UPDATE client_reply SET interpretation = ? WHERE id = ?").run(JSON.stringify(read), replyId);
    db.prepare("UPDATE task SET status = 'answered', response_id = ? WHERE case_id = ? AND status = 'open'").run(replyId, c.id);
    return enqueueRun(db, c.agency_id, "reassess");
  })();
  return { replyId, duplicate: Boolean(existing), interpretation: read, runId };
}
