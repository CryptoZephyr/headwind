import { createCashTable, ensureScenario, readCashTable, type CfoBinding } from "../lib/cfo";
import { getDb } from "../lib/db";
import { getAgency, type CfoBindings } from "../lib/store";

const agencyId = process.argv[2];
if (!agencyId) throw new Error("Usage: tsx scripts/cfo-setup.ts <agencyId>");
const db = getDb();
const agency = getAgency(db, agencyId);
const label = agency.is_sample ? "sample agency" : agency.name;
const inputs = { openingCash: agency.opening_cash_cents / 100, expectedReceipts: 0, recruiterPay: agency.recruiter_pay_cents / 100, otherExpenses: agency.other_expenses_cents / 100 };
const bindings: Partial<CfoBindings> = {};
for (const which of ["Reviewed", "Downside"] as const) {
  const scenario = `Headwind ${which} (${label})`;
  const table = `Headwind ${which} cash (${label})`;
  const prefix = `HW ${which}`;
  await ensureScenario(scenario);
  const binding: CfoBinding = { scenario, table, prefix };
  try {
    await readCashTable(binding);
    console.log(`${scenario}: table already exists`);
  } catch {
    const r = await createCashTable(binding, `Headwind ${which}`, inputs);
    console.log(`${scenario}: table created (change ${r.change_log_id ?? "?"})`);
    if (r.page?.url) bindings.pageUrl = r.page.url;
  }
  bindings[which === "Reviewed" ? "reviewed" : "downside"] = binding;
}
db.prepare("UPDATE agency SET cfo_binding = ? WHERE id = ?").run(JSON.stringify(bindings), agencyId);
console.log(JSON.stringify(bindings));
