import { money } from "@/lib/format";

export const STAGE_LABEL: Record<string, string> = {
  match_companies: "Matching client companies",
  check_listings: "Checking role listings",
  assess: "Assessing each role",
  forecast: "Recalculating the forecast",
  sync_cfo: "Saving and checking the cfo.ai scenarios",
};

const STATUS: Record<string, { label: string; cls: string }> = {
  offer_accepted: { label: "Offer accepted", cls: "chip-offer" },
  client_pause: { label: "Client confirmed pause", cls: "chip-pause" },
  placed_elsewhere: { label: "Placed elsewhere", cls: "chip-lost" },
  unknown: { label: "Needs confirming", cls: "chip-confirm" },
  unreviewed: { label: "Holds", cls: "chip-holds" },
};

export function statusOf(outcome: string | null, state: string, hasTask: boolean): { label: string; cls: string } {
  if (hasTask) return STATUS.unknown;
  if (outcome && STATUS[outcome]) return STATUS[outcome];
  if (state === "open" || state === "unreviewed") return { label: "Not reviewed yet", cls: "chip-neutral" };
  return STATUS[state] ?? { label: "Not reviewed yet", cls: "chip-neutral" };
}

export function StatusChip({ label, cls }: { label: string; cls: string }) {
  return <span className={`chip ${cls}`}>{label}</span>;
}

const SOURCE: Record<string, string> = { live: "Live · Crustdata", agency_supplied: "Agency records", scenario_replay: "Simulated", client_reply: "Client reply" };

export function SourceTag({ provenance, date }: { provenance: string; date?: string | null }) {
  const label = SOURCE[provenance] ?? provenance;
  return (
    <span className={`tag${provenance === "scenario_replay" ? " tag-sim" : ""}`}>
      {label}
      {date ? ` · ${date}` : " · date not given"}
    </span>
  );
}

export interface GapProps {
  originalCents: number;
  reviewedCents: number;
  downsideCents: number;
  currency: string;
  correctionLabel?: string;
  exposureLabel?: string;
}

// One closing-cash scale with three alternative scenarios; amounts are never added together.
export function GapChart({ originalCents, reviewedCents, downsideCents, currency, correctionLabel, exposureLabel }: GapProps) {
  const vals = [originalCents, reviewedCents, downsideCents];
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.max(Math.abs(hi), 100);
  const pad = span * 0.08;
  const x = (v: number) => ((v - (lo - pad)) / (span + pad * 2)) * 100;
  const marks = [
    { key: "Downside", v: downsideCents, cls: "gap-downside" },
    { key: "Reviewed", v: reviewedCents, cls: "gap-reviewed" },
    { key: "Original", v: originalCents, cls: "gap-original" },
  ];
  const correction = originalCents - reviewedCents;
  const exposure = reviewedCents - downsideCents;
  return (
    <figure className="gap" aria-label={`Closing cash: Original ${money(originalCents, currency)}, Reviewed ${money(reviewedCents, currency)}, Downside ${money(downsideCents, currency)}. Alternative scenarios, not added together.`}>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="gap-svg" aria-hidden="true">
        <line x1="0" x2="100" y1="12" y2="12" className="gap-axis" />
        {lo < 0 && <line x1={x(0)} x2={x(0)} y1="4" y2="20" className="gap-zero" />}
        {correction !== 0 && <rect x={Math.min(x(originalCents), x(reviewedCents))} width={Math.abs(x(originalCents) - x(reviewedCents))} y="7" height="10" className="gap-fill" />}
        {exposure !== 0 && <rect x={Math.min(x(reviewedCents), x(downsideCents))} width={Math.abs(x(reviewedCents) - x(downsideCents))} y="9" height="6" className="gap-fill-soft" />}
        {marks.map((m) => <line key={m.key} x1={x(m.v)} x2={x(m.v)} y1="2" y2="22" className={`gap-mark ${m.cls}`} />)}
      </svg>
      <ul className="gap-legend">
        {[...marks].reverse().map((m) => (
          <li key={m.key} className={m.cls}>
            <span className="gap-key" aria-hidden="true" />
            <span>{m.key === "Original" ? "Original (imported baseline)" : m.key}</span>
            <strong>{money(m.v, currency)}</strong>
          </li>
        ))}
      </ul>
      <figcaption className="small">
        {correction !== 0 && <span className="gap-note">{correctionLabel ?? `${money(Math.abs(correction), currency)} ${correction > 0 ? "lower" : "higher"} than Original after this review`}</span>}
        {exposure !== 0 && <span className="gap-note">{exposureLabel ?? `${money(Math.abs(exposure), currency)} unresolved exposure in Downside`}</span>}
        {correction === 0 && exposure === 0 && <span className="gap-note">All three scenarios are equal: nothing in this review changes closing cash.</span>}
        <span className="meta">Alternative scenarios for the same period. They are never added together.</span>
      </figcaption>
    </figure>
  );
}
