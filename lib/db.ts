import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS agency (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_sample INTEGER NOT NULL DEFAULT 0,
  cash_date TEXT NOT NULL,
  horizon_start TEXT NOT NULL,
  horizon_end TEXT NOT NULL,
  opening_cash_cents INTEGER NOT NULL,
  receivables_cents INTEGER NOT NULL DEFAULT 0,
  recruiter_pay_cents INTEGER NOT NULL,
  other_expenses_cents INTEGER NOT NULL,
  cfo_binding TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS client (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agency(id),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  account_manager TEXT,
  last_confirmed_at TEXT,
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  company_id TEXT,
  matched_name TEXT,
  UNIQUE (agency_id, domain)
);
CREATE TABLE IF NOT EXISTS mandate (
  id TEXT NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agency(id),
  client_id TEXT NOT NULL REFERENCES client(id),
  role_title TEXT NOT NULL,
  location TEXT,
  fee_cents INTEGER NOT NULL,
  stage TEXT NOT NULL,
  probability_bps INTEGER NOT NULL,
  fee_trigger TEXT NOT NULL,
  expected_trigger_date TEXT NOT NULL,
  payment_terms_days INTEGER NOT NULL,
  candidate_record TEXT,
  listing_url TEXT,
  listing_seen_at TEXT,
  PRIMARY KEY (agency_id, id)
);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agency(id),
  client_id TEXT REFERENCES client(id),
  mandate_id TEXT,
  source_type TEXT NOT NULL,
  provenance TEXT NOT NULL CHECK (provenance IN ('live','agency_supplied','scenario_replay')),
  source_date TEXT,
  retrieved_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS review_run (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agency(id),
  kind TEXT NOT NULL DEFAULT 'weekly',
  status TEXT NOT NULL,
  step TEXT NOT NULL,
  available_at TEXT,
  input_version TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  budget TEXT NOT NULL,
  usage TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  trace_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS review_step (
  run_id TEXT NOT NULL REFERENCES review_run(id),
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  output TEXT,
  completed_at TEXT,
  PRIMARY KEY (run_id, step)
);
CREATE TABLE IF NOT EXISTS case_record (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agency(id),
  mandate_id TEXT NOT NULL,
  observation TEXT NOT NULL,
  state TEXT NOT NULL,
  outcome TEXT,
  paused_until TEXT,
  summary TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (agency_id, mandate_id)
);
CREATE TABLE IF NOT EXISTS decision (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_record(id),
  run_id TEXT,
  case_version INTEGER NOT NULL,
  outcomes_considered TEXT NOT NULL,
  selected_outcome TEXT NOT NULL,
  support TEXT NOT NULL,
  missing_facts TEXT NOT NULL,
  evidence_ids TEXT NOT NULL,
  assumption_change TEXT NOT NULL,
  forecast_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (case_id, case_version)
);
CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_record(id),
  case_version INTEGER NOT NULL,
  question TEXT NOT NULL,
  assignee TEXT,
  priority_reason TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  response_id TEXT,
  UNIQUE (case_id, case_version)
);
CREATE TABLE IF NOT EXISTS client_reply (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_record(id),
  reply_date TEXT NOT NULL,
  source TEXT NOT NULL,
  body TEXT NOT NULL,
  is_simulated INTEGER NOT NULL DEFAULT 0,
  interpretation TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (case_id, content_hash)
);
CREATE TABLE IF NOT EXISTS forecast_version (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agency(id),
  run_id TEXT,
  assumptions TEXT NOT NULL,
  intended TEXT NOT NULL,
  readback TEXT,
  verification TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS external_operation (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  reconciliation TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let instance: Database.Database | null = null;

function addColumn(db: Database.Database, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function dbPath(): string {
  return process.env.HEADWIND_DB ?? path.join(process.cwd(), "data", "headwind.db");
}

export function getDb(): Database.Database {
  if (instance) return instance;
  const file = dbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  instance = new Database(file);
  instance.pragma("busy_timeout = 5000");
  instance.exec(SCHEMA);
  addColumn(instance, "client", "retired_at", "TEXT");
  addColumn(instance, "evidence", "retired_at", "TEXT");
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
