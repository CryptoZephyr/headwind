"use client";

import { useState } from "react";
import { GapChart, StatusChip } from "@/components/ui";

const REPLY = "Hiring for the Product Engineer role is paused until 1 February 2027 while we finalise next year's budget.";

export function SampleWalkthrough() {
  const [replied, setReplied] = useState(false);
  const roles = [
    {
      id: "M-101", title: "Senior Software Engineer", client: "Retool", fee: "$10,000 × 80%",
      status: { label: "Offer accepted", cls: "chip-offer" },
      evidence: "Agency records, 2026-10-08: candidate signed the offer letter.",
      effect: "$8,000 stays in every scenario.",
    },
    {
      id: "M-102", title: "Product Engineer", client: "Linear", fee: "$10,000 × 50%",
      status: replied ? { label: "Client confirmed pause", cls: "chip-pause" } : { label: "Needs confirming", cls: "chip-confirm" },
      evidence: replied ? `Client reply (simulated), 2026-10-11: "${REPLY}"` : "Agency records: two candidates at final interview. No recent client confirmation.",
      effect: replied ? "$5,000 moves out of Reviewed until February 2027." : "Question for the account manager: is this role still going ahead this month?",
    },
    {
      id: "M-103", title: "Staff Billing Platform Engineer", client: "Vercel", fee: "$10,000 × 40%",
      status: { label: "Needs confirming", cls: "chip-confirm" },
      evidence: "Crustdata: company-wide openings fell. No matching listing found since 2026-09-15. Neither proves this role stopped.",
      effect: "$4,000 stays in Reviewed and is left out of Downside until the client confirms.",
    },
  ];
  return (
    <div className="walk">
      <p className="banner banner-sample"><strong>Sample review, simulated.</strong> Northbeam Talent is a made-up agency. This walkthrough runs in your browser with saved sample figures for November 2026; nothing is sent to Crustdata or cfo.ai.</p>
      <div className="walk-grid">
        <div className="walk-roles">
          {roles.map((r) => (
            <article key={r.id} className="walk-role">
              <div className="walk-role-head">
                <p><strong>{r.title}</strong> <span className="muted small">· {r.client} · <span className="mono">{r.id}</span></span></p>
                <StatusChip {...r.status} />
              </div>
              <p className="meta">Fee × agency&apos;s placement chance: {r.fee}</p>
              <p className="small">{r.evidence}</p>
              <p className="small"><strong>{r.effect}</strong></p>
              {r.id === "M-102" && (
                <button type="button" className="btn btn-secondary" onClick={() => setReplied((v) => !v)} aria-pressed={replied}>
                  {replied ? "Undo the sample reply" : "Paste the sample client reply"}
                </button>
              )}
            </article>
          ))}
        </div>
        <div className="walk-chart panel">
          <p className="eyebrow">Reviewed closing cash · November 2026 · sample</p>
          <p className="hero-number" aria-live="polite">{replied ? "$17,000" : "$22,000"}</p>
          <GapChart
            originalCents={2_200_000}
            reviewedCents={replied ? 1_700_000 : 2_200_000}
            downsideCents={1_300_000}
            currency="USD"
            correctionLabel="$5,000 reduction from a client-confirmed pause"
            exposureLabel={replied ? "$4,000 unresolved exposure" : "$9,000 unresolved exposure across two unconfirmed roles"}
          />
          <p className="meta">In the live app, the Reviewed and Downside scenarios are written to cfo.ai and read back before they show as verified.</p>
        </div>
      </div>
    </div>
  );
}
