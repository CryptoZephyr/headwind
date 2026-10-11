import "../lib/env";
import { getDb } from "../lib/db";
import { scheduleWeekly } from "../lib/review";

const results = scheduleWeekly(getDb(), new Date().toISOString().slice(0, 10));
for (const r of results) console.log(r.runId ? `Weekly review for ${r.agencyId}: ${r.runId}` : `Skipped ${r.agencyId}: ${r.skipped}`);
if (!results.length) console.log("No agency imported yet; nothing to review.");
