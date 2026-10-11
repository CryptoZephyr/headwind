import type Database from "better-sqlite3";
import type { ImportPreview } from "./importer";
import { sha256, stableId } from "./ids";
import type { AgencyInput, MandateInput } from "./scenarios";
import type { CfoBinding } from "./cfo";

export interface AgencyRow {
  id: string;
  name: string;
  currency: string;
  is_sample: number;
  cash_date: string;
  horizon_start: string;
  horizon_end: string;
  opening_cash_cents: number;
  receivables_cents: number;
  recruiter_pay_cents: number;
  other_expenses_cents: number;
  cfo_binding: string | null;
}

export interface ClientRecord {
  id: string;
  agency_id: string;
  name: string;
  domain: string;
  account_manager: string | null;
  last_confirmed_at: string | null;
  match_status: string;
  company_id: string | null;
  matched_name: string | null;
  retired_at: string | null;
}

export interface MandateRecord {
  id: string;
  agency_id: string;
  client_id: string;
  role_title: string;
  location: string | null;
  fee_cents: number;
  stage: string;
  probability_bps: number;
  fee_trigger: string;
  expected_trigger_date: string;
  payment_terms_days: number;
  candidate_record: string | null;
  listing_url: string | null;
  listing_seen_at: string | null;
}

export interface EvidenceRecord {
  id: string;
  agency_id: string;
  client_id: string | null;
  mandate_id: string | null;
  source_type: string;
  provenance: "live" | "agency_supplied" | "scenario_replay";
  source_date: string | null;
  retrieved_at: string;
  summary: string;
  payload: string;
  complete: number;
}

export interface CfoBindings {
  reviewed: CfoBinding;
  downside: CfoBinding;
  pageUrl?: string;
}

export function commitImport(db: Database.Database, p: ImportPreview, opts: { isSample: boolean }): string {
  if (p.errors.length || !p.finance) throw new Error("Fix the highlighted rows before importing.");
  const f = p.finance;
  const agencyId = stableId("agency", f.agencyName);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO agency (id, name, currency, is_sample, cash_date, horizon_start, horizon_end, opening_cash_cents, receivables_cents, recruiter_pay_cents, other_expenses_cents)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET cash_date=excluded.cash_date, horizon_start=excluded.horizon_start, horizon_end=excluded.horizon_end,
         opening_cash_cents=excluded.opening_cash_cents, receivables_cents=excluded.receivables_cents, recruiter_pay_cents=excluded.recruiter_pay_cents, other_expenses_cents=excluded.other_expenses_cents`
    ).run(agencyId, f.agencyName, f.currency, opts.isSample ? 1 : 0, f.cashDate, f.horizonStart, f.horizonEnd, f.openingCashCents, f.receivablesCents, f.recruiterPayCents, f.otherExpensesCents);
    db.prepare("UPDATE evidence SET retired_at = ? WHERE agency_id = ? AND provenance = 'agency_supplied' AND retired_at IS NULL").run(now, agencyId);
    db.prepare("UPDATE client SET retired_at = ? WHERE agency_id = ? AND retired_at IS NULL").run(now, agencyId);
    const keep = JSON.stringify(p.mandates.map((m) => m.id));
    db.prepare("DELETE FROM mandate WHERE agency_id = ? AND id NOT IN (SELECT value FROM json_each(?))").run(agencyId, keep);
    db.prepare("UPDATE case_record SET state = 'removed', updated_at = datetime('now') WHERE agency_id = ? AND mandate_id NOT IN (SELECT value FROM json_each(?))").run(agencyId, keep);
    const clientIds = new Map<string, string>();
    for (const c of p.clients) {
      const id = stableId("client", agencyId, c.domain);
      clientIds.set(c.domain, id);
      db.prepare(
        `INSERT INTO client (id, agency_id, name, domain, account_manager, last_confirmed_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, account_manager=excluded.account_manager, last_confirmed_at=excluded.last_confirmed_at, retired_at=NULL`
      ).run(id, agencyId, c.name, c.domain, c.accountManager, c.lastConfirmedAt);
    }
    for (const m of p.mandates) {
      const clientId = clientIds.get(m.clientDomain)!;
      db.prepare(
        `INSERT INTO mandate (id, agency_id, client_id, role_title, location, fee_cents, stage, probability_bps, fee_trigger, expected_trigger_date, payment_terms_days, candidate_record, listing_url, listing_seen_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(agency_id, id) DO UPDATE SET client_id=excluded.client_id, role_title=excluded.role_title, location=excluded.location, fee_cents=excluded.fee_cents, stage=excluded.stage,
           probability_bps=excluded.probability_bps, fee_trigger=excluded.fee_trigger, expected_trigger_date=excluded.expected_trigger_date, payment_terms_days=excluded.payment_terms_days,
           candidate_record=excluded.candidate_record, listing_url=excluded.listing_url, listing_seen_at=excluded.listing_seen_at`
      ).run(m.id, agencyId, clientId, m.roleTitle, m.location, m.feeCents, m.stage, m.probabilityBps, m.feeTrigger, m.expectedTriggerDate, m.paymentTermsDays, m.candidateRecord, m.listingUrl, m.listingSeenAt);
      if (m.candidateRecord) {
        insertEvidence(db, { id: stableId("ev", agencyId, m.id, "candidate", sha256(m.candidateRecord)), agency_id: agencyId, client_id: clientId, mandate_id: m.id, source_type: "candidate_record", provenance: "agency_supplied", source_date: f.cashDate, retrieved_at: now, summary: `Agency record (${m.stage}): ${m.candidateRecord}`, payload: JSON.stringify({ stage: m.stage, record: m.candidateRecord }), complete: 1 });
      }
      if (m.listingSeenAt) {
        insertEvidence(db, { id: stableId("ev", agencyId, m.id, "listing_baseline", m.listingSeenAt), agency_id: agencyId, client_id: clientId, mandate_id: m.id, source_type: "listing_baseline", provenance: "agency_supplied", source_date: m.listingSeenAt, retrieved_at: now, summary: `Agency saw the public listing for "${m.roleTitle}" on ${m.listingSeenAt}${m.listingUrl ? ` at ${m.listingUrl}` : ""}.`, payload: JSON.stringify({ url: m.listingUrl, seen: m.listingSeenAt }), complete: 1 });
      }
    }
    for (const u of p.updates) {
      const clientId = clientIds.get(p.mandates.find((m) => m.id === u.mandateId)!.clientDomain)!;
      insertEvidence(db, { id: stableId("ev", agencyId, u.mandateId, "update", sha256(u)), agency_id: agencyId, client_id: clientId, mandate_id: u.mandateId, source_type: "agency_update", provenance: "agency_supplied", source_date: u.updateDate, retrieved_at: now, summary: `${u.source} on ${u.updateDate}: ${u.text}`, payload: JSON.stringify(u), complete: 1 });
    }
  })();
  return agencyId;
}

export function insertEvidence(db: Database.Database, e: EvidenceRecord): void {
  db.prepare(
    `INSERT INTO evidence (id, agency_id, client_id, mandate_id, source_type, provenance, source_date, retrieved_at, summary, payload, complete)
     VALUES (@id,@agency_id,@client_id,@mandate_id,@source_type,@provenance,@source_date,@retrieved_at,@summary,@payload,@complete)
     ON CONFLICT(id) DO UPDATE SET retired_at = NULL`
  ).run(e);
}

export function getAgency(db: Database.Database, id: string): AgencyRow {
  const a = db.prepare("SELECT * FROM agency WHERE id = ?").get(id) as AgencyRow | undefined;
  if (!a) throw new Error(`No agency ${id}`);
  return a;
}

export function agencyInput(a: AgencyRow): AgencyInput {
  return { horizonStart: a.horizon_start, horizonEnd: a.horizon_end, openingCashCents: a.opening_cash_cents, receivablesCents: a.receivables_cents, recruiterPayCents: a.recruiter_pay_cents, otherExpensesCents: a.other_expenses_cents };
}

export function mandates(db: Database.Database, agencyId: string): MandateRecord[] {
  return db.prepare("SELECT * FROM mandate WHERE agency_id = ? ORDER BY id").all(agencyId) as MandateRecord[];
}

export function mandateInput(m: MandateRecord): MandateInput {
  return { id: m.id, feeCents: m.fee_cents, probabilityBps: m.probability_bps, expectedTriggerDate: m.expected_trigger_date, paymentTermsDays: m.payment_terms_days };
}

export function clients(db: Database.Database, agencyId: string): ClientRecord[] {
  return db.prepare("SELECT * FROM client WHERE agency_id = ? AND retired_at IS NULL ORDER BY name").all(agencyId) as ClientRecord[];
}

export function evidenceFor(db: Database.Database, agencyId: string, mandateId: string, clientId: string): EvidenceRecord[] {
  return db.prepare("SELECT * FROM evidence WHERE agency_id = ? AND retired_at IS NULL AND (mandate_id = ? OR (mandate_id IS NULL AND client_id = ?)) ORDER BY retrieved_at, id").all(agencyId, mandateId, clientId) as EvidenceRecord[];
}

export function inputVersion(db: Database.Database, agencyId: string): string {
  const a = getAgency(db, agencyId);
  const ms = mandates(db, agencyId);
  const cs = clients(db, agencyId).map((c) => ({ ...c, match_status: undefined, company_id: undefined, matched_name: undefined, retired_at: undefined }));
  const agencyFields = { ...a, cfo_binding: undefined };
  return sha256({ agencyFields, ms, cs }).slice(0, 16);
}
