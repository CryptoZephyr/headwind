import "../lib/env";
import { getDb } from "../lib/db";
import { enqueueRun } from "../lib/review";

const db = getDb();
const agencies = db.prepare("SELECT id FROM agency ORDER BY id").all() as { id: string }[];
for (const a of agencies) console.log(`Weekly review for ${a.id}: ${enqueueRun(db, a.id)}`);
if (!agencies.length) console.log("No agency imported yet; nothing to review.");
