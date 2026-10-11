import Papa from "papaparse";
import type { MandateInput } from "./scenarios";

export interface RowError {
  file: "clients" | "mandates" | "finance" | "updates";
  row: number;
  field: string;
  message: string;
}

export interface ClientRow {
  name: string;
  domain: string;
  accountManager: string;
  lastConfirmedAt: string | null;
}

export interface MandateRow extends MandateInput {
  clientDomain: string;
  roleTitle: string;
  location: string;
  stage: string;
  feeTrigger: string;
  candidateRecord: string;
  listingUrl: string;
  listingSeenAt: string | null;
}

export interface FinanceRow {
  agencyName: string;
  currency: "USD";
  cashDate: string;
  horizonStart: string;
  horizonEnd: string;
  openingCashCents: number;
  receivablesCents: number;
  recruiterPayCents: number;
  otherExpensesCents: number;
}

export interface UpdateRow {
  mandateId: string;
  updateDate: string;
  source: string;
  text: string;
}

export interface ImportPreview {
  clients: ClientRow[];
  mandates: MandateRow[];
  finance: FinanceRow | null;
  updates: UpdateRow[];
  errors: RowError[];
}

export const STAGES = ["sourcing", "shortlist", "interviewing", "final_interview", "offer_made", "offer_accepted"] as const;
export const FEE_TRIGGERS = ["start_date", "offer_acceptance"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCsv(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  return parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").trim()])));
}

export function parseMoneyCents(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s]/g, "").replace(/^USD/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function parseProbabilityBps(raw: string): number | null {
  const pct = raw.endsWith("%");
  const n = Number(raw.replace("%", "").trim());
  if (raw === "" || Number.isNaN(n)) return null;
  const bps = Math.round(pct || n > 1 ? n * 100 : n * 10000);
  return bps >= 0 && bps <= 10000 ? bps : null;
}

function validDate(v: string): boolean {
  return DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
}

function normaliseDomain(v: string): string {
  return v.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export function previewImport(files: { clients: string; mandates: string; finance: string; updates?: string }): ImportPreview {
  const errors: RowError[] = [];
  const err = (file: RowError["file"], row: number, field: string, message: string) => errors.push({ file, row, field, message });

  const clients: ClientRow[] = [];
  const seenDomains = new Set<string>();
  parseCsv(files.clients).forEach((r, i) => {
    const row = i + 2;
    const domain = normaliseDomain(r.domain ?? "");
    let ok = true;
    if (!r.client_name) { err("clients", row, "client_name", "Client name is empty."); ok = false; }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) { err("clients", row, "domain", `"${r.domain ?? ""}" is not a website domain like acme.com.`); ok = false; }
    else if (seenDomains.has(domain)) { err("clients", row, "domain", `${domain} appears twice. Each client needs its own row.`); ok = false; }
    const last = r.last_confirmed_date ?? "";
    if (last && !validDate(last)) { err("clients", row, "last_confirmed_date", `"${last}" isn't a date. Use YYYY-MM-DD.`); ok = false; }
    if (ok) {
      seenDomains.add(domain);
      clients.push({ name: r.client_name, domain, accountManager: r.account_manager ?? "", lastConfirmedAt: last || null });
    }
  });

  const mandates: MandateRow[] = [];
  const seenIds = new Set<string>();
  parseCsv(files.mandates).forEach((r, i) => {
    const row = i + 2;
    let ok = true;
    const id = r.mandate_id ?? "";
    if (!id) { err("mandates", row, "mandate_id", "Mandate ID is empty."); ok = false; }
    else if (seenIds.has(id)) { err("mandates", row, "mandate_id", `${id} appears twice. Mandate IDs must be unique.`); ok = false; }
    const clientDomain = normaliseDomain(r.client_domain ?? "");
    if (!seenDomains.has(clientDomain)) { err("mandates", row, "client_domain", `No client with domain "${r.client_domain ?? ""}" in the clients file.`); ok = false; }
    if (!r.role_title) { err("mandates", row, "role_title", "Role title is empty."); ok = false; }
    const fee = parseMoneyCents(r.agreed_fee ?? "");
    if (fee === null) { err("mandates", row, "agreed_fee", `"${r.agreed_fee ?? ""}" isn't an amount. Use a number like 10000 or 10000.50.`); ok = false; }
    const prob = parseProbabilityBps(r.placement_probability ?? "");
    if (prob === null) { err("mandates", row, "placement_probability", `"${r.placement_probability ?? ""}" isn't a probability. Use 80% or 0.8.`); ok = false; }
    const stage = (r.stage ?? "").toLowerCase();
    if (!(STAGES as readonly string[]).includes(stage)) { err("mandates", row, "stage", `"${r.stage ?? ""}" isn't a known stage. Use one of: ${STAGES.join(", ")}.`); ok = false; }
    const trigger = (r.fee_trigger ?? "").toLowerCase();
    if (!(FEE_TRIGGERS as readonly string[]).includes(trigger)) { err("mandates", row, "fee_trigger", `"${r.fee_trigger ?? ""}" isn't a fee trigger. Use start_date or offer_acceptance.`); ok = false; }
    const date = r.expected_trigger_date ?? "";
    if (!validDate(date)) { err("mandates", row, "expected_trigger_date", `"${date}" isn't a date. Use YYYY-MM-DD.`); ok = false; }
    const terms = Number(r.payment_terms_days ?? "");
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) { err("mandates", row, "payment_terms_days", `"${r.payment_terms_days ?? ""}" isn't a number of days between 0 and 365.`); ok = false; }
    const seen = r.listing_seen_date ?? "";
    if (seen && !validDate(seen)) { err("mandates", row, "listing_seen_date", `"${seen}" isn't a date. Use YYYY-MM-DD.`); ok = false; }
    if (ok && fee !== null && prob !== null) {
      seenIds.add(id);
      mandates.push({
        id, clientDomain, roleTitle: r.role_title, location: r.location ?? "", feeCents: fee, probabilityBps: prob, stage, feeTrigger: trigger,
        expectedTriggerDate: date, paymentTermsDays: terms, candidateRecord: r.candidate_record ?? "", listingUrl: r.listing_url ?? "", listingSeenAt: seen || null,
      });
    }
  });

  let finance: FinanceRow | null = null;
  const kv = Object.fromEntries(parseCsv(files.finance).map((r) => [(r.key ?? "").toLowerCase(), r.value ?? ""]));
  const money = (k: string, required: boolean): number => {
    const raw = kv[k] ?? "";
    if (!raw && !required) return 0;
    const v = parseMoneyCents(raw);
    if (v === null) { err("finance", 0, k, raw ? `"${raw}" isn't an amount.` : `${k} is missing.`); return 0; }
    return v;
  };
  const date = (k: string): string => {
    const v = kv[k] ?? "";
    if (!validDate(v)) err("finance", 0, k, v ? `"${v}" isn't a date. Use YYYY-MM-DD.` : `${k} is missing.`);
    return v;
  };
  const before = errors.length;
  const currency = (kv.currency ?? "").toUpperCase();
  if (currency !== "USD") err("finance", 0, "currency", currency ? `Only USD is supported in this build, not ${currency}.` : "currency is missing.");
  if (!kv.agency_name) err("finance", 0, "agency_name", "agency_name is missing.");
  const f: FinanceRow = {
    agencyName: kv.agency_name ?? "", currency: "USD", cashDate: date("cash_date"), horizonStart: date("horizon_start"), horizonEnd: date("horizon_end"),
    openingCashCents: money("opening_cash", true), receivablesCents: money("collectible_receivables", false),
    recruiterPayCents: money("recruiter_pay", true), otherExpensesCents: money("other_expenses", true),
  };
  if (errors.length === before && f.horizonEnd < f.horizonStart) err("finance", 0, "horizon_end", "The forecast horizon ends before it starts.");
  if (errors.length === before) finance = f;

  const updates: UpdateRow[] = [];
  if (files.updates?.trim()) {
    parseCsv(files.updates).forEach((r, i) => {
      const row = i + 2;
      let ok = true;
      if (!seenIds.has(r.mandate_id ?? "")) { err("updates", row, "mandate_id", `No mandate "${r.mandate_id ?? ""}" in the mandates file.`); ok = false; }
      if (!validDate(r.update_date ?? "")) { err("updates", row, "update_date", `"${r.update_date ?? ""}" isn't a date. Use YYYY-MM-DD.`); ok = false; }
      if (!r.text) { err("updates", row, "text", "The update text is empty."); ok = false; }
      if (ok) updates.push({ mandateId: r.mandate_id, updateDate: r.update_date, source: r.source || "agency record", text: r.text });
    });
  }

  return { clients, mandates, finance, updates, errors };
}
