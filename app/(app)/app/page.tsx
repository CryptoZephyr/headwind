import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { LoadSample } from "@/components/LoadSample";
import { ReplyForm } from "@/components/ReplyForm";
import { ReviewControls } from "@/components/ReviewControls";
import { GapChart, SourceTag, STAGE_LABEL, StatusChip, statusOf } from "@/components/ui";
import { getDb } from "@/lib/db";
import { money, OUTCOME_LABEL, percent } from "@/lib/format";
import { STEPS } from "@/lib/review";
import { overview, type Overview } from "@/lib/views";

export const dynamic = "force-dynamic";

const RUN_LABEL: Record<string, string> = {
  queued: "Waiting for the worker to start",
  running: "Running",
  retrying: "Retrying after an error",
  complete: "Complete",
  partial: "Partly done",
  failed: "Stopped",
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

function daysSince(date: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

function correctionLabel(intended: NonNullable<Overview["forecast"]>["intended"], cases: Overview["cases"], cur: string): string | undefined {
  const gap = intended.original.closingCashCents - intended.reviewed.closingCashCents;
  if (gap <= 0) return undefined;
  const reviewed = new Map(intended.reviewed.lines.map((l) => [l.mandateId, l.includedCents]));
  const parts = intended.original.lines
    .map((l) => ({ id: l.mandateId, cents: l.includedCents - (reviewed.get(l.mandateId) ?? 0) }))
    .filter((d) => d.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .map((d) => {
      const c = cases.find((x) => x.mandateId === d.id);
      const why = c?.outcome ? OUTCOME_LABEL[c.outcome] ?? c.outcome : "review";
      return `${money(d.cents, cur)} from ${c ? `${c.roleTitle} at ${c.clientName}` : d.id} (${why.toLowerCase()})`;
    });
  return parts.length ? `${money(gap, cur)} lower than Original: ${parts.join("; ")}` : undefined;
}

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function Home() {
  const { data, error } = load();
  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        <strong>Headwind can&apos;t open its database.</strong> {error} Check the HEADWIND_DB setting on the server, then reload this page. Nothing has been changed.
      </div>
    );
  }
  if (!data) {
    return (
      <section className="setup">
        <h1>Set up your agency</h1>
        <p className="muted">Headwind reviews this month&apos;s placement forecast. Start with your own CSV files or the labelled sample agency.</p>
        <div className="setup-choices">
          <div className="panel stack">
            <h2>Import your CSV files</h2>
            <p className="small muted">Clients, open roles and cash figures. Every row is checked before anything is saved.</p>
            <Link className="btn btn-primary" href="/import">Import your CSV files</Link>
          </div>
          <div className="panel stack">
            <h2>Try the labelled sample agency</h2>
            <p className="small muted">A made-up agency with three roles at real companies. Everything stays marked as sample data.</p>
            <LoadSample />
          </div>
        </div>
      </section>
    );
  }

  const { agency, runs, cases, forecast, cfo } = data;
  const latest = runs[0];
  const active = Boolean(latest && ["queued", "running", "retrying"].includes(latest.status));
  const cur = agency.currency;
  const reply = agency.is_sample ? sampleReply() : null;
  const today = new Date().toISOString().slice(0, 10);
  const open = cases.filter((c) => c.openTask);
  const usage = latest ? (JSON.parse(latest.usage || "{}") as { crustdataCredits?: number; modelCalls?: number }) : {};
  const plan: readonly string[] = latest ? STEPS[latest.kind as keyof typeof STEPS] ?? [] : [];
  const stepNo = latest ? plan.indexOf(latest.step) + 1 : 0;
  const correction = forecast ? correctionLabel(forecast.intended, cases, cur) : undefined;

  return (
    <div className="overview">
      {agency.is_sample === 1 && (
        <p className="banner banner-sample">
          <strong>Sample agency.</strong> The agency, roles, candidates, fees and client replies are made up. Company hiring data is live from Crustdata.
        </p>
      )}

      <header className="ov-head">
        <div>
          <p className="eyebrow">{agency.name}</p>
          <h1>Weekly revenue check</h1>
        </div>
        <p className="meta">Forecast period {agency.horizon_start} to {agency.horizon_end} · {cur} · cash date {agency.cash_date}</p>
      </header>

      <section className="ov-status" aria-live="polite">
        <div className="ov-status-text">
          {!latest && <p>No review yet. Run one to check this period&apos;s placements against client evidence.</p>}
          {latest && (
            <>
              <p>
                <strong>{latest.kind === "reassess" ? "Reassessment" : "Weekly review"}: {RUN_LABEL[latest.status] ?? latest.status}</strong>
                {active && latest.status !== "queued" && <> · {STAGE_LABEL[latest.step] ?? "Working"} {stepNo > 0 && <> (step {stepNo} of {plan.length})</>}</>}
              </p>
              <p className="meta">
                Started {stamp(latest.created_at)} · {usage.crustdataCredits ?? 0} Crustdata credits · {usage.modelCalls ?? 0} model calls
                {latest.attempts > 0 && <> · {latest.attempts} failed attempt{latest.attempts === 1 ? "" : "s"}</>}
              </p>
              {active && latest.steps.length > 0 && (
                <ol className="progress" aria-label="Review progress">
                  {latest.steps.map((s) => (
                    <li key={s.step} className={`progress-seg is-${s.status}`}><span className="sr-only">{STAGE_LABEL[s.step] ?? "Step"}: {s.status}</span></li>
                  ))}
                </ol>
              )}
              {latest.error && latest.status === "retrying" && <p className="banner">{latest.error} The worker checks what was saved and tries again automatically.</p>}
              {latest.error && latest.status === "partial" && (
                <p className="banner banner-warn" role="alert">
                  {latest.error} Finished steps are saved. &ldquo;Retry unfinished steps&rdquo; picks up from the step that stopped, without repeating finished ones. <Link href="/docs/using-headwind/recovery">How recovery works</Link>
                </p>
              )}
              {latest.error && latest.status === "failed" && (
                <p className="banner banner-error" role="alert">{latest.error} Saved results are kept. Fix the cause above, then run the review again.</p>
              )}
            </>
          )}
        </div>
        <ReviewControls agencyId={agency.id} active={active} retryRunId={latest && ["partial", "failed"].includes(latest.status) ? latest.id : null} />
      </section>

      <div className="ov-grid">
        <section className="ov-hero" aria-labelledby="cash-h">
          <h2 id="cash-h" className="eyebrow">Reviewed closing cash</h2>
          {!forecast && <p className="muted">No forecast yet. It appears after the first review finishes.</p>}
          {forecast && (
            <>
              <p className="hero-number">{money(forecast.intended.reviewed.closingCashCents, cur)}</p>
              <p className="small">
                {forecast.intended.reviewed.closingCashCents === forecast.intended.original.closingCashCents
                  ? "Same as the imported baseline."
                  : `${money(Math.abs(forecast.intended.original.closingCashCents - forecast.intended.reviewed.closingCashCents), cur)} ${forecast.intended.reviewed.closingCashCents < forecast.intended.original.closingCashCents ? "below" : "above"} the imported baseline.`}{" "}
                <span className="meta">Forecast saved {stamp(forecast.createdAt)}</span>
              </p>
              <GapChart
                originalCents={forecast.intended.original.closingCashCents}
                reviewedCents={forecast.intended.reviewed.closingCashCents}
                downsideCents={forecast.intended.downside.closingCashCents}
                currency={cur}
                correctionLabel={correction}
              />
              <ul className="verify">
                {(["reviewed", "downside"] as const).map((k) => {
                  const s = forecast.intended[k];
                  const rb = forecast.readback?.[s.name];
                  return (
                    <li key={k}>
                      <span>{s.name} in cfo.ai</span>
                      {rb ? <span className="chip chip-offer">Verified in cfo.ai</span> : <span className="chip chip-confirm">{forecast.verification === "pending" ? "Checking the saved values" : "Not verified"}</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="meta">
                Original is the agency&apos;s imported baseline and isn&apos;t written to cfo.ai. Main is never touched.
                {cfo?.pageUrl && <> <a href={cfo.pageUrl}>Open the scenarios in cfo.ai</a></>}
              </p>
            </>
          )}
        </section>

        <section className="ov-questions" aria-labelledby="q-h">
          <h2 id="q-h">This week&apos;s questions</h2>
          {cases.length > 0 && open.length === 0 && <p className="muted">No open questions. Every role has a supported decision.</p>}
          {cases.length === 0 && <p className="muted">Questions appear after the first review.</p>}
          <ul className="qlist">
            {open.map((c) => (
              <li key={c.id} className="qrow">
                <p className="small"><strong>{c.roleTitle}</strong> · {c.clientName}</p>
                <p>{c.openTask!.question}</p>
                <p className="meta">Ask: {c.openTask!.assignee ?? "Unassigned"} · Due: {c.openTask!.due ?? "Not set"}</p>
                <ReplyForm caseId={c.id} roleLabel={`${c.roleTitle} at ${c.clientName}`} sample={c.mandateId === "M-102" ? reply : null} isSample={agency.is_sample === 1} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="roles-h" className="roles">
        <h2 id="roles-h">Roles</h2>
        {cases.length === 0 && <p className="muted">No roles reviewed yet. Each open role gets a case after the first review.</p>}
        {cases.length > 0 && (
          <div className="role-head small muted" aria-hidden="true">
            <span>Role</span><span>Status</span><span className="num">Fee</span><span className="num">Agency&apos;s placement chance</span>
          </div>
        )}
        {cases.map((c) => {
          const st = statusOf(c.outcome, c.state, Boolean(c.openTask));
          const lastClient = [...c.evidence.filter((e) => e.source_type === "client_confirmation").map((e) => e.source_date), ...c.replies.map((r) => r.date)]
            .filter((d): d is string => Boolean(d))
            .sort()
            .at(-1);
          const stale = lastClient ? daysSince(lastClient, today) : null;
          return (
            <details key={c.id} className="role" open={Boolean(c.openTask)}>
              <summary>
                <span className="role-title"><strong>{c.roleTitle}</strong><span className="small muted">{c.clientName} · <span className="mono">{c.mandateId}</span></span></span>
                <span><StatusChip {...st} />{c.pausedUntil && <span className="meta"> until {c.pausedUntil}</span>}</span>
                <span className="num">{money(c.feeCents, cur)}</span>
                <span className="num">{percent(c.probabilityBps)}</span>
              </summary>
              <div className="role-body">
                <p className="meta mobile-only">Fee {money(c.feeCents, cur)} · Agency&apos;s placement chance {percent(c.probabilityBps)}</p>
                {c.summary && <p>{c.summary}</p>}
                {c.matchStatus !== "matched" && (
                  <p className="banner banner-warn">Company match: {c.matchStatus === "ambiguous" ? "more than one possible company, so no public evidence is used" : c.matchStatus === "not_found" ? "Crustdata doesn't know this company, so no public evidence is used" : "not checked yet"}. The decision relies on agency records and client replies.</p>
                )}
                {stale !== null && stale > 14 && <p className="meta">Last client confirmation is {stale} days old.</p>}
                {c.listingHistory && <p className="meta">{c.listingHistory}</p>}
                <p className="meta">Expected fee date {c.expectedTriggerDate}. Expected fee = fee × the agency&apos;s placement chance, counted only if payment (after payment terms) lands in the forecast period.</p>
                <div className="role-cols">
                  <div>
                    <h3>Evidence</h3>
                    {c.evidence.length === 0 && <p className="meta">No evidence saved yet.</p>}
                    <ul className="evlist">
                      {c.evidence.map((e) => (
                        <li key={e.id}>
                          <SourceTag provenance={e.provenance} date={e.source_date} />
                          <p className="small">{e.summary}{e.complete === 0 && " (incomplete result, not counted as absence)"}</p>
                          <p className="meta">Retrieved {e.retrieved_at.slice(0, 10)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Decision history</h3>
                    {c.decisions.length === 0 && <p className="meta">No decisions yet.</p>}
                    <ul className="evlist">
                      {c.decisions.map((d) => (
                        <li key={d.version}>
                          <p className="small"><strong>Version {d.version}: {OUTCOME_LABEL[d.outcome] ?? d.outcome}</strong> <span className="meta">{d.createdAt.slice(0, 10)}</span></p>
                          <p className="small">{d.support} {d.assumptionChange}</p>
                          {d.missing.length > 0 && <p className="meta">Still missing: {d.missing.join("; ")}</p>}
                        </li>
                      ))}
                    </ul>
                    {c.replies.length > 0 && (
                      <>
                        <h3>Client replies</h3>
                        <ul className="evlist">
                          {c.replies.map((r) => (
                            <li key={r.id}>
                              <SourceTag provenance={r.simulated ? "scenario_replay" : "client_reply"} date={r.date} />
                              <p className="small">&ldquo;{r.body}&rdquo;</p>
                              {r.reading && <p className="meta">Read as: {r.reading}</p>}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
