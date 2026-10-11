import "../../lib/env";
import { getDb } from "../../lib/db";
import { recordClientReply } from "../../lib/reply";
const db = getDb();
const c = db.prepare("SELECT id FROM case_record WHERE mandate_id = 'M-103'").get() as { id: string };
const r = await recordClientReply(db, { caseId: c.id, replyDate: "2026-10-11", source: "Simulated email (recovery test)", body: "Hi, quick update: we filled the Staff Billing Platform Engineer role through another agency last week, so please close it on your side.", isSimulated: true });
console.log(JSON.stringify(r));
