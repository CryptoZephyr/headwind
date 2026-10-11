import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { LoadSample } from "@/components/LoadSample";
import { ReplyForm } from "@/components/ReplyForm";
import { ReviewControls } from "@/components/ReviewControls";
import { getDb } from "@/lib/db";
import { money, OUTCOME_LABEL, percent, SOURCE_LABEL } from "@/lib/format";
import { overview, type Overview } from "@/lib/views";

export const dynamic = "force-dynamic";

const RUN_LABEL: Record<string, string> = {
  queued: "Waiting for the worker",
  running: "Running",
  retrying: "Retrying after an error",
  complete: "Complete",
  partial: "Partly done",
  failed: "Failed",
};

function load(): { data: Overview | null; error: string | null } {
  try {
    return { data: overview(getDb()), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Couldn't read the database." };
  }
}

function sampleReply(): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "fixtures", "sample", "reply-M-102.txt"), "utf8");
  } catch {
    return null;
  }
}

export default function Home() {
  const { data, error } = load();
  if (error) return <p role="alert">Headwind can&apos;t open its database: {error}. Check HEADWIND_DB and reload.</p>;
  if (!data) {
    return (
      <section>
        <h1>Set up your agency</h1>
        <p>Headwind reviews this month&apos;s placement forecast. Import your clients, open mandates and cash figures, or try the labelled sample agency first.</p>
        <LoadSample />
        <p><Link href="/import">Import your own CSV files</Link></p>
      </section>
    );
  }
  const { agency, runs, cases, forecast, cfo } = data;
  const latest = runs[0];
  const active = Boolean(latest && ["queued", "running", "retrying"].includes(latest.status));
  const cur = agency.currency;
  const reply = agency.is_sample ? sampleReply() : null;

  return (
    <>
      <h1>{agency.name}</h1>
      {agency.is_sample === 1 && <p><strong>Sample data.</strong> Agency, mandates and candidates are made up. Company hiring data is live from Crustdata.</p>}
      <p>Cash date {agency.cash_date}. Review window {agency.horizon_start} to {agency.horizon_end}.</p>

      <section>
        <h2>Weekly review</h2>
        <ReviewControls agencyId={agency.id} active={active} retryRunId={latest && ["partial", "failed"].includes(latest.status) ? latest.id : null} />
        {!latest && <p>No review yet. Run one to check this month&apos;s placements against client evidence.</p>}
        {latest && (
          <div>
            <p>
              Latest: {latest.kind === "reassess" ? "reassessment" : "weekly review"} · <strong>{RUN_LABEL[latest.status] ?? latest.status}</strong>
              {latest.status !== "complete" && <> · step {latest.step}</>}{latest.attempts > 0 && <> · failed attempts {latest.attempts}</>}
            </p>
            <ul>
              {latest.steps.map((s) => (
                <li key={s.step}>{s.step}: {s.status}</li>
              ))}
            </ul>
            {latest.error && <p role="alert">Last error: {latest.error}{latest.status === "retrying" && " The worker will try again automatically."}</p>}
            {latest.status === "partial" && <p role="alert">Some steps didn&apos;t finish. Saved results are kept; “Retry unfinished steps” picks up from the failed step without repeating finished ones.</p>}
          </div>
        )}
      </section>

      <section>
        <h2>Forecast</h2>
        {!forecast && <p>No forecast yet. It appears after the first review.</p>}
        {forecast && (
          <>
            <table>
              <thead>
                <tr><th>Scenario</th><th>Expected receipts</th><th>Closing cash</th><th>cfo.ai</th></tr>
              </thead>
              <tbody>
                {(["original", "reviewed", "downside"] as const).map((k) => {
                  const s = forecast.intended[k];
                  const rb = forecast.readback?.[s.name];
                  return (
                    <tr key={k}>
                      <td>{s.name}</td>
                      <td>{money(s.expectedReceiptsCents, cur)}</td>
                      <td>{money(s.closingCashCents, cur)}</td>
                      <td>{k === "original" ? "Owner's numbers" : rb ? `Verified (${rb.how})` : forecast.verification === "pending" ? "Not written yet" : forecast.verification}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>
              Opening cash {money(agency.opening_cash_cents, cur)} + receipts − recruiter pay {money(agency.recruiter_pay_cents, cur)} − other costs {money(agency.other_expenses_cents, cur)}.
              Expected receipt = fee × placement probability, counted only if fee date + payment terms falls in the window.
            </p>
            {cfo?.pageUrl && <p><a href={cfo.pageUrl}>Open the scenarios in cfo.ai</a></p>}
          </>
        )}
      </section>

      <section>
        <h2>Placements</h2>
        {cases.length === 0 && <p>No cases yet. Each open mandate gets a case after the first review.</p>}
        {cases.map((c) => (
          <article key={c.id} style={{ borderTop: "1px solid #ccc", paddingTop: 8 }}>
            <h3>{c.mandateId} · {c.roleTitle} at {c.clientName}</h3>
            <p>
              Fee {money(c.feeCents, cur)} · probability {percent(c.probabilityBps)} · expected fee date {c.expectedTriggerDate} · company match: {c.matchStatus}
            </p>
            <p><strong>{OUTCOME_LABEL[c.outcome ?? c.state] ?? c.state}</strong>{c.pausedUntil && ` until ${c.pausedUntil}`} (version {c.version})</p>
            {c.summary && <p>{c.summary}</p>}
            {c.listingHistory && <p>{c.listingHistory}</p>}
            {c.openTask && (
              <div>
                <p>Ask {c.openTask.assignee ?? "the account manager"} by {c.openTask.due}: <em>{c.openTask.question}</em></p>
                <p>Why: {c.openTask.reason}</p>
                <ReplyForm caseId={c.id} sample={c.mandateId === "M-102" ? reply : null} />
              </div>
            )}
            <details>
              <summary>Evidence ({c.evidence.length})</summary>
              <ul>
                {c.evidence.map((e) => (
                  <li key={e.id}>
                    [{SOURCE_LABEL[e.provenance] ?? e.provenance}{e.source_date && `, ${e.source_date}`}] {e.summary}
                    {e.complete === 0 && " (incomplete result)"} <small>retrieved {e.retrieved_at.slice(0, 10)}</small>
                  </li>
                ))}
              </ul>
            </details>
            {c.decisions.length > 0 && (
              <details>
                <summary>Decision history ({c.decisions.length})</summary>
                <ul>
                  {c.decisions.map((d) => (
                    <li key={d.version}>
                      v{d.version} {OUTCOME_LABEL[d.outcome] ?? d.outcome}: {d.support} {d.assumptionChange}
                      {d.missing.length > 0 && <> Missing: {d.missing.join("; ")}</>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {c.replies.length > 0 && (
              <details>
                <summary>Client replies ({c.replies.length})</summary>
                <ul>
                  {c.replies.map((r) => (
                    <li key={r.id}>{r.date} {r.simulated && "(simulated) "}{r.source}: “{r.body}”{r.reading && <> Read as: {r.reading}.</>}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
