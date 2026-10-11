export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function percent(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

export const OUTCOME_LABEL: Record<string, string> = {
  unreviewed: "No change",
  offer_accepted: "Offer accepted",
  client_pause: "Client confirmed pause",
  placed_elsewhere: "Placed elsewhere",
  unknown: "Unknown, needs confirmation",
};

export const SOURCE_LABEL: Record<string, string> = {
  live: "Live (Crustdata)",
  agency_supplied: "Agency-supplied",
  scenario_replay: "Simulated",
};
