import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMoneyCents, parseProbabilityBps, previewImport } from "../lib/importer";

const dir = path.join(__dirname, "..", "fixtures", "sample");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

describe("sample import", () => {
  it("imports the labelled sample without errors", () => {
    const p = previewImport({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv") });
    expect(p.errors).toEqual([]);
    expect(p.mandates.map((m) => m.id)).toEqual(["M-101", "M-102", "M-103"]);
    expect(p.mandates[0]).toMatchObject({ feeCents: 1_000_000, probabilityBps: 8000 });
    expect(p.finance?.openingCashCents).toBe(2_000_000);
  });

  it("explains bad fields and keeps valid rows", () => {
    const p = previewImport({
      clients: "client_name,domain\nAcme,acme.com\nBad,not a domain",
      mandates: "mandate_id,client_domain,role_title,agreed_fee,stage,placement_probability,fee_trigger,expected_trigger_date,payment_terms_days\nM-1,acme.com,Engineer,ten,offer_made,120%,start_date,2026-13-01,30\nM-2,acme.com,Engineer,5000,offer_made,50%,start_date,2026-11-01,30\nM-2,acme.com,Engineer,5000,offer_made,50%,start_date,2026-11-01,30",
      finance: "key,value\nagency_name,X\ncurrency,EUR",
    });
    expect(p.clients).toHaveLength(1);
    expect(p.mandates.map((m) => m.id)).toEqual(["M-2"]);
    const fields = p.errors.map((e) => `${e.file}.${e.field}`);
    expect(fields).toEqual(expect.arrayContaining(["clients.domain", "mandates.agreed_fee", "mandates.placement_probability", "mandates.expected_trigger_date", "mandates.mandate_id", "finance.currency", "finance.opening_cash"]));
    expect(p.finance).toBeNull();
  });

  it("parses money and probability", () => {
    expect(parseMoneyCents("$10,000.5")).toBe(1_000_050);
    expect(parseMoneyCents("10.123")).toBeNull();
    expect(parseProbabilityBps("0.4")).toBe(4000);
    expect(parseProbabilityBps("40%")).toBe(4000);
    expect(parseProbabilityBps("140%")).toBeNull();
  });
});
