import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MCP_URL = "https://api.cfo.ai/mcp";
const AUTH_URL = "https://complete-cottage-73.authkit.app/oauth2/token";
const USER_AGENT = "headwind-worker/0.1";

interface TokenFile {
  access_token: string;
  refresh_token: string;
  client_id?: string;
  [k: string]: unknown;
}

export class CfoError extends Error {
  constructor(message: string, readonly kind: "auth" | "timeout" | "rejected" | "transport") {
    super(message);
  }
}

function tokenPath(): string {
  return process.env.CFO_TOKEN_FILE || path.join(os.homedir(), ".headwind-secrets", "cfo-token.json");
}

function clientId(): string {
  return process.env.CFO_CLIENT_ID || "client_01M4M49251GYNTS2CP7VX2A7K0";
}

function readToken(): TokenFile {
  return JSON.parse(fs.readFileSync(tokenPath(), "utf8")) as TokenFile;
}

async function refreshToken(): Promise<void> {
  const t = readToken();
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: clientId() }),
  });
  if (!res.ok) throw new CfoError(`cfo.ai sign-in expired and could not be renewed (HTTP ${res.status}). Reconnect cfo.ai.`, "auth");
  const next = { ...t, ...((await res.json()) as Partial<TokenFile>) };
  fs.writeFileSync(tokenPath(), JSON.stringify(next), { mode: 0o600 });
}

let sessionId: string | null = null;
let rpcId = 1;

async function post(payload: object, timeoutMs: number): Promise<{ status: number; body: unknown; session: string | null }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${readToken().access_token}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
    "user-agent": USER_AGENT,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  let res: Response;
  try {
    res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    throw new CfoError(name === "TimeoutError" ? "cfo.ai did not answer in time" : "Could not reach cfo.ai", name === "TimeoutError" ? "timeout" : "transport");
  }
  const text = await res.text();
  let body: unknown = null;
  if (text.trim().startsWith("{")) body = JSON.parse(text);
  else {
    const msgs = text.split("\n").filter((l) => l.startsWith("data:") && l.slice(5).trim()).map((l) => JSON.parse(l.slice(5)));
    body = msgs.at(-1) ?? null;
  }
  return { status: res.status, body, session: res.headers.get("mcp-session-id") };
}

async function initialise(): Promise<void> {
  sessionId = null;
  const init = { jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "headwind", version: "0.1" } } };
  let r = await post({ ...init, id: rpcId++ }, 30_000);
  if (r.status === 401 || r.status === 403) {
    await refreshToken();
    r = await post({ ...init, id: rpcId++ }, 30_000);
  }
  if (r.status === 401 || r.status === 403) throw new CfoError("cfo.ai rejected the sign-in", "auth");
  sessionId = r.session;
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, 30_000);
}

interface RpcResult {
  result?: { content?: { type: string; text: string }[]; structuredContent?: unknown; isError?: boolean };
  error?: { message: string };
}

export async function callTool<T>(name: string, args: object, timeoutMs = 120_000): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!sessionId) await initialise();
    const r = await post({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }, timeoutMs);
    if (r.status === 401 || r.status === 403) {
      await refreshToken();
      sessionId = null;
      continue;
    }
    if (r.status === 400 || r.status === 404) {
      sessionId = null;
      continue;
    }
    if (r.status >= 500) throw new CfoError(`cfo.ai returned HTTP ${r.status}`, "transport");
    const body = r.body as RpcResult;
    if (body?.error) throw new CfoError(`cfo.ai refused the request: ${body.error.message}`, "rejected");
    const res = body?.result;
    const parsed = res?.structuredContent ?? (res?.content?.[0]?.text ? JSON.parse(res.content[0].text) : null);
    if (res?.isError) throw new CfoError(`cfo.ai refused the request: ${JSON.stringify(parsed).slice(0, 300)}`, "rejected");
    return parsed as T;
  }
  throw new CfoError("cfo.ai sign-in could not be renewed", "auth");
}

export interface CfoRow {
  ref: string;
  display_name: string;
  values: (number | null)[];
  formulas?: Record<string, string>;
}

export interface CfoTableRead {
  rows: CfoRow[];
  change_log_id?: number | string;
  as_of?: number;
  status?: string;
  coverage?: { calculation?: string };
  page?: { url?: string };
}

export const CASH_ROWS = ["Opening Cash", "Expected Receipts", "Recruiter Pay", "Other Expenses", "Closing Cash"] as const;
export type CashRow = (typeof CASH_ROWS)[number];

export interface CfoBinding {
  scenario: string;
  table: string;
  prefix: string;
}

export interface CashInputs {
  openingCash: number;
  expectedReceipts: number;
  recruiterPay: number;
  otherExpenses: number;
}

export function rowValues(read: CfoTableRead, prefix: string): Partial<Record<CashRow, number>> {
  const out: Partial<Record<CashRow, number>> = {};
  for (const name of CASH_ROWS) {
    const row = read.rows.find((r) => r.display_name === `${prefix} ${name}`);
    const v = row?.values?.[0];
    if (typeof v === "number") out[name] = v;
  }
  return out;
}

function rowRef(read: CfoTableRead, prefix: string, name: CashRow): string {
  const row = read.rows.find((r) => r.display_name === `${prefix} ${name}`);
  if (!row) throw new CfoError(`The cfo.ai table is missing the row "${prefix} ${name}"`, "rejected");
  return row.ref;
}

export async function readCashTable(b: CfoBinding): Promise<CfoTableRead> {
  return callTool<CfoTableRead>("inspect_table_blocks", { scenario: b.scenario, read: { target: b.table, comparison: "none" } });
}

export async function writeCashInputs(b: CfoBinding, current: CfoTableRead, inputs: CashInputs): Promise<CfoTableRead> {
  const pairs: [CashRow, number][] = [
    ["Opening Cash", inputs.openingCash],
    ["Expected Receipts", inputs.expectedReceipts],
    ["Recruiter Pay", inputs.recruiterPay],
    ["Other Expenses", inputs.otherExpenses],
  ];
  return callTool<CfoTableRead>("edit_table_blocks", {
    scenario: b.scenario,
    update: {
      target: b.table,
      row_updates: pairs.map(([name, v]) => ({ rows: [rowRef(current, b.prefix, name)], formula: String(v) })),
      readback: {},
    },
  });
}

export async function createCashTable(b: CfoBinding, page: string, inputs: CashInputs): Promise<CfoTableRead> {
  const p = b.prefix;
  return callTool<CfoTableRead>("edit_table_blocks", {
    scenario: b.scenario,
    create: {
      name: b.table,
      page,
      window: { granularity: "NO_GRANULARITY" },
      columns: [],
      rows: [
        { variable: `${p} Opening Cash`, formula: String(inputs.openingCash) },
        { variable: `${p} Expected Receipts`, formula: String(inputs.expectedReceipts) },
        { variable: `${p} Recruiter Pay`, formula: String(inputs.recruiterPay) },
        { variable: `${p} Other Expenses`, formula: String(inputs.otherExpenses) },
        { variable: `${p} Closing Cash`, formula: `\`${p} Opening Cash\` + \`${p} Expected Receipts\` - \`${p} Recruiter Pay\` - \`${p} Other Expenses\`` },
      ],
    },
  });
}

export async function ensureScenario(name: string): Promise<void> {
  const list = await callTool<{ scenarios?: { display_name: string }[] }>("inspect_scenarios", { read: { sections: [{ section: "list" }] } });
  if (list.scenarios?.some((s) => s.display_name === name)) return;
  await callTool("edit_scenarios", { create: { name } });
}
