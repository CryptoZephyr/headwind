import "../lib/env";
import fs from "node:fs";
import path from "node:path";
import { cleanRoleTitle, fetchCompany, fetchListings, ProviderError, titleMatches, type CompanySnapshot, type ListingSnapshot } from "../lib/crustdata";
import { previewImport } from "../lib/importer";

// Usage: tsx scripts/coverage-test.ts [--live]
// Without --live it only validates the sample agencies' CSV files (no credits).
const live = process.argv.includes("--live");
const root = path.join(process.cwd(), "fixtures", "agencies");
const today = new Date().toISOString().slice(0, 10);
const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

const reserve = 40;
// Worst observed costs: an enrich with several candidate companies cost 6 credits, a listing search 0.27.
const maxEnrichCost = 6;
const maxListingCost = 0.5;

// Answers are reused only within the same day and for the exact same query, so a rerun never reports old evidence as current.
const cachePath = path.join(process.cwd(), "eval", "results", `coverage-cache-${today}.json`);
const cache: { companies: Record<string, CompanySnapshot>; listings: Record<string, ListingSnapshot> } = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
  : { companies: {}, listings: {} };
const saveCache = () => fs.writeFileSync(cachePath, JSON.stringify(cache));

// Crustdata allows about 30 requests a minute; pace calls and wait out a 429 instead of losing the run.
async function paced<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      return await call();
    } catch (e) {
      if (!(e instanceof ProviderError && e.kind === "rate_limit") || attempt >= 4) throw e;
      console.log("Rate limited; waiting 65 s.");
      await new Promise((r) => setTimeout(r, 65_000));
    }
  }
}

async function creditBalance(): Promise<number> {
  const res = await fetch("https://api.crustdata.com/account/credits", {
    headers: { authorization: `Bearer ${process.env.CRUSTDATA_API_KEY}`, "x-api-version": "2025-11-01" },
  });
  if (!res.ok) throw new Error(`Couldn't read the Crustdata balance (HTTP ${res.status}).`);
  return ((await res.json()) as { account: { credits: number } }).account.credits;
}

function completeMonths(series: { date: string }[]): number {
  const thisMonth = today.slice(0, 7);
  return series.filter((p) => p.date.slice(0, 7) < thisMonth).length;
}

const agencies = fs.readdirSync(root).sort().map((slug) => {
  const read = (f: string) => fs.readFileSync(path.join(root, slug, f), "utf8");
  const preview = previewImport({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv") });
  if (preview.errors.length) throw new Error(`${slug}: ${JSON.stringify(preview.errors.slice(0, 3))}`);
  return { slug, preview };
});
const companyCount = agencies.reduce((n, a) => n + a.preview.clients.length, 0);
const roleCount = agencies.reduce((n, a) => n + a.preview.mandates.length, 0);
console.log(`${agencies.length} agencies valid: ${companyCount} companies, ${roleCount} roles.`);
if (!live) process.exit(0);

const before = await creditBalance();
console.log(`Balance before: ${before} credits; the run stops before any company that could take it below ${reserve}.`);

const listingKey = (companyId: string, roleTitle: string) => `${companyId}|${cleanRoleTitle(roleTitle).toLowerCase()}|${since}`;
const results = [];
let stoppedEarly: string | null = null;
for (const { slug, preview } of agencies) {
  if (stoppedEarly) break;
  const companies = [];
  for (const c of preview.clients) {
    const roleCountHere = preview.mandates.filter((x) => x.clientDomain === c.domain).length;
    const bound = (cache.companies[c.domain] ? 0 : maxEnrichCost) + roleCountHere * maxListingCost;
    if (bound > 0) {
      const balance = await paced(creditBalance);
      if (balance - bound < reserve) {
        stoppedEarly = `Stopped before ${c.domain}: balance ${balance} could fall below the ${reserve}-credit reserve (this company could cost up to ${bound}).`;
        console.log(stoppedEarly);
        break;
      }
    }
    const snap = cache.companies[c.domain] ?? (cache.companies[c.domain] = await paced(() => fetchCompany(c.domain)));
    saveCache();
    const exact = snap.candidates.filter((x) => x.primaryDomain === c.domain && x.confidence >= 0.9);
    const match = exact.length === 1 ? "matched" : snap.candidates.length === 0 ? "not_found" : "ambiguous";
    const roles = [];
    for (const m of preview.mandates.filter((x) => x.clientDomain === c.domain)) {
      if (match !== "matched") { roles.push({ mandateId: m.id, roleTitle: cleanRoleTitle(m.roleTitle), listing: "blocked_by_match" }); continue; }
      const ls = cache.listings[listingKey(exact[0].companyId, m.roleTitle)] ?? (cache.listings[listingKey(exact[0].companyId, m.roleTitle)] = await paced(() => fetchListings(exact[0].companyId, m.roleTitle, since)));
      saveCache();
      const hit = ls.listings.find((l) => titleMatches(l.title, m.roleTitle));
      roles.push({ mandateId: m.id, roleTitle: cleanRoleTitle(m.roleTitle), listing: hit ? "found" : ls.complete ? "not_found" : "incomplete", hit: hit ?? null, returned: ls.listings.length, credits: ls.credits });
    }
    companies.push({
      name: c.name, domain: c.domain, match,
      candidates: snap.candidates, openingsCount: snap.openingsCount,
      timeseriesPoints: snap.timeseries.length, completeMonths: completeMonths(snap.timeseries),
      latestPoint: snap.timeseries.at(-1) ?? null, credits: snap.credits, roles,
    });
    console.log(`${slug} ${c.domain}: ${match}, openings ${snap.openingsCount ?? "n/a"}, ${completeMonths(snap.timeseries)} months, listings ${roles.map((r) => r.listing).join("/")}`);
  }
  results.push({ slug, agency: preview.finance?.agencyName ?? slug, companies });
}
const after = await creditBalance();
const out = path.join(process.cwd(), "eval", "results", `coverage-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), listingsSince: since, creditsBefore: before, creditsAfter: after, stoppedEarly, results }, null, 2));
console.log(`Balance after: ${after}. Saved ${out}`);
