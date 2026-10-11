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
    <div className="import stack">
      <p className="eyebrow">Step 1 of 3 · then run a review, then answer questions</p>
      <h1>Import agency data</h1>
      <p className="muted import-intro">Upload CSV files exported from your ATS or spreadsheet. Money is in whole currency units, probability is a percentage, and dates are YYYY-MM-DD. Nothing is saved until you press Import.</p>
      <p><button type="button" className="btn btn-text" onClick={useSample}>Fill in the labelled sample files</button></p>
      <div className="import-files">
        {FILES.map((f) => (
          <fieldset key={f.key} className="panel">
            <legend>{f.label}{!f.required && <span className="meta"> (optional)</span>}</legend>
            <p className="meta">Columns: <span className="mono">{f.columns}</span></p>
            <label htmlFor={`file-${f.key}`} className="sr-only">Choose {f.label} file</label>
            <input id={`file-${f.key}`} type="file" accept=".csv,text/csv" onChange={(e) => readFile(f.key, e.target.files?.[0])} />
            <label htmlFor={`text-${f.key}`} className="small muted">Or paste the CSV</label>
            <textarea id={`text-${f.key}`} rows={4} className="mono" value={text[f.key]} onChange={(e) => { setText((t) => ({ ...t, [f.key]: e.target.value })); setPreview(null); }} placeholder={f.required ? "Required" : "Optional"} />
          </fieldset>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={runPreview} disabled={!ready || status.kind === "busy"}>Check rows</button>
        <button type="button" className="btn btn-primary" onClick={commit} disabled={!preview || preview.errors.length > 0 || status.kind === "busy"}>Import</button>
        {!ready && <span className="meta">Add the client, mandate and finance files to check them.</span>}
      </div>
      {status.message && <p className={status.kind === "error" ? "banner banner-error" : "banner"} role={status.kind === "error" ? "alert" : "status"}>{status.message}{status.kind === "done" && <> <Link href="/app">Go to the Overview</Link></>}</p>}
      {preview && (
        <section className="stack">
          <h2>Preview</h2>
          <p>
            {preview.clients.length} clients, {preview.mandates.length} mandates, {preview.updates.length} updates ready
            {preview.finance ? `, finance for ${preview.finance.agencyName}` : ", finance not readable yet"}.
          </p>
          {preview.errors.length === 0 ? (
            <p className="banner">All rows are valid. Press Import to save them.</p>
          ) : (
            <>
              <p role="alert" className="banner banner-error">{preview.errors.length} row problem{preview.errors.length === 1 ? "" : "s"}. Fix them in the boxes above and check again. Your text is kept.</p>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>File</th><th>Row</th><th>Field</th><th>Problem</th></tr></thead>
                  <tbody>
                    {preview.errors.map((e, i) => (
                      <tr key={i}><td>{e.file}</td><td>{e.row}</td><td className="mono">{e.field}</td><td>{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {preview.mandates.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Mandate</th><th>Client</th><th>Role</th><th>Stage</th><th className="num">Fee</th><th className="num">Probability</th><th>Fee date</th></tr></thead>
                <tbody>
                  {preview.mandates.map((m) => (
                    <tr key={m.id}><td className="mono">{m.id}</td><td>{m.clientDomain}</td><td>{m.roleTitle}</td><td>{m.stage}</td><td className="num">{(m.feeCents / 100).toLocaleString()}</td><td className="num">{m.probabilityBps / 100}%</td><td>{m.expectedTriggerDate}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
