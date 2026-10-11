"use client";

import Link from "next/link";
import { useState } from "react";
import type { ImportPreview } from "@/lib/importer";

type FileKey = "clients" | "mandates" | "finance" | "updates";
const FILES: { key: FileKey; label: string; required: boolean; columns: string }[] = [
  { key: "clients", label: "Clients", required: true, columns: "client_name, domain, account_manager, last_confirmed_date" },
  { key: "mandates", label: "Mandates", required: true, columns: "mandate_id, client_domain, role_title, location, agreed_fee, stage, placement_probability, fee_trigger, expected_trigger_date, payment_terms_days, candidate_record, listing_url, listing_seen_date" },
  { key: "finance", label: "Finance", required: true, columns: "two columns key,value with rows agency_name, currency, cash_date, horizon_start, horizon_end, opening_cash, collectible_receivables, recruiter_pay, other_expenses" },
  { key: "updates", label: "Updates (optional)", required: false, columns: "mandate_id, update_date, source, text" },
];

export default function ImportPage() {
  const [text, setText] = useState<Record<FileKey, string>>({ clients: "", mandates: "", finance: "", updates: "" });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "error" | "done"; message?: string }>({ kind: "idle" });

  async function readFile(key: FileKey, file: File | undefined) {
    if (!file) return;
    setText((t) => ({ ...t, [key]: "" }));
    const content = await file.text();
    setText((t) => ({ ...t, [key]: content }));
    setPreview(null);
  }

  async function call(url: string): Promise<{ ok: boolean; data: { error?: string; agencyId?: string; preview?: ImportPreview } & Partial<ImportPreview> }> {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(text) });
    return { ok: res.ok, data: await res.json() };
  }

  async function runPreview() {
    setStatus({ kind: "busy", message: "Checking rows…" });
    try {
      const { ok, data } = await call("/api/import/preview");
      if (!ok) throw new Error(data.error || "Couldn't check the files.");
      setPreview(data as ImportPreview);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't check the files." });
    }
  }

  async function commit() {
    setStatus({ kind: "busy", message: "Importing…" });
    try {
      const { ok, data } = await call("/api/import/commit");
      if (data.preview) setPreview(data.preview);
      if (!ok) throw new Error(data.error || "Import failed.");
      setStatus({ kind: "done", message: "Imported. Go to the overview to run your first review." });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Import failed." });
    }
  }

  async function useSample() {
    const res = await fetch("/api/import/sample");
    const s = (await res.json()) as Record<FileKey, string>;
    setText({ clients: s.clients, mandates: s.mandates, finance: s.finance, updates: s.updates });
    setPreview(null);
  }

  const ready = Boolean(text.clients && text.mandates && text.finance);
  return (
    <>
      <h1>Import agency data</h1>
      <p>Upload CSV files exported from your ATS or spreadsheet. Money is in whole currency units (USD), probability is a percentage, dates are YYYY-MM-DD. Nothing is saved until you press Import.</p>
      <p><button type="button" onClick={useSample}>Fill in the sample files</button></p>
      {FILES.map((f) => (
        <fieldset key={f.key}>
          <legend>{f.label}</legend>
          <small>Columns: {f.columns}</small>
          <br />
          <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(f.key, e.target.files?.[0])} />
          <br />
          <textarea rows={4} cols={90} value={text[f.key]} onChange={(e) => { setText((t) => ({ ...t, [f.key]: e.target.value })); setPreview(null); }} placeholder={f.required ? "Required" : "Optional"} />
        </fieldset>
      ))}
      <p>
        <button type="button" onClick={runPreview} disabled={!ready || status.kind === "busy"}>Check rows</button>{" "}
        <button type="button" onClick={commit} disabled={!preview || preview.errors.length > 0 || status.kind === "busy"}>Import</button>
      </p>
      {status.message && <p role={status.kind === "error" ? "alert" : "status"}>{status.message}{status.kind === "done" && <> <Link href="/">Overview</Link></>}</p>}
      {preview && (
        <section>
          <h2>Preview</h2>
          <p>
            {preview.clients.length} clients, {preview.mandates.length} mandates, {preview.updates.length} updates ready
            {preview.finance ? `, finance for ${preview.finance.agencyName}` : ", finance not readable yet"}.
          </p>
          {preview.errors.length === 0 ? (
            <p>All rows are valid.</p>
          ) : (
            <>
              <p role="alert">{preview.errors.length} row problem(s). Fix them in the boxes above and check again; valid rows are kept.</p>
              <table>
                <thead><tr><th>File</th><th>Row</th><th>Field</th><th>Problem</th></tr></thead>
                <tbody>
                  {preview.errors.map((e, i) => (
                    <tr key={i}><td>{e.file}</td><td>{e.row}</td><td>{e.field}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {preview.mandates.length > 0 && (
            <table>
              <thead><tr><th>Mandate</th><th>Client</th><th>Role</th><th>Stage</th><th>Fee</th><th>Probability</th><th>Fee date</th></tr></thead>
              <tbody>
                {preview.mandates.map((m) => (
                  <tr key={m.id}><td>{m.id}</td><td>{m.clientDomain}</td><td>{m.roleTitle}</td><td>{m.stage}</td><td>{(m.feeCents / 100).toLocaleString()}</td><td>{m.probabilityBps / 100}%</td><td>{m.expectedTriggerDate}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
