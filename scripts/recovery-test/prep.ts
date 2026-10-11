import "../../lib/env";
import Database from "better-sqlite3";
const src = new Database("/var/lib/headwind/headwind.db", { readonly: true });
await src.backup("/var/lib/headwind/recovery-test.db");
const db = new Database("/var/lib/headwind/recovery-test.db");
const a = db.prepare("SELECT id FROM agency WHERE is_sample = 1").get() as { id: string };
db.prepare("UPDATE agency SET is_sample = 0, name = 'Recovery test copy', cfo_binding = NULL WHERE id = ?").run(a.id);
db.prepare("DELETE FROM review_run WHERE status IN ('queued','retrying')").run();
console.log(a.id);
