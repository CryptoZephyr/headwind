"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ReviewControls({ agencyId, active, retryRunId }: { agencyId: string; active: boolean; retryRunId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  async function start() {
    await send("/api/reviews", { agencyId });
  }

  async function retry() {
    await send("/api/reviews/retry", { runId: retryRunId });
  }

  async function send(url: string, payload: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't start the review.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-controls">
      <div className="btn-row">
        <button className="btn btn-primary" onClick={start} disabled={busy || active}>
          {active ? "Review running…" : busy ? "Starting…" : "Run weekly review"}
        </button>
        {retryRunId && !active && (
          <button className="btn btn-secondary" onClick={retry} disabled={busy}>
            {busy ? "Retrying…" : "Retry unfinished steps"}
          </button>
        )}
      </div>
      {active && <p className="meta">This page refreshes on its own while the worker runs.</p>}
      {error && <p role="alert" className="field-error">{error} Nothing was started. Try again.</p>}
    </div>
  );
}
