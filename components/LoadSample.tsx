"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoadSample() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | string>("idle");
  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/import/sample", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return setState(data.error || "Couldn't load the sample agency.");
      setState("idle");
      router.refresh();
    } catch {
      setState("Couldn't reach Headwind. Check your connection.");
    }
  }
  return (
    <div className="stack">
      <button className="btn btn-secondary" onClick={load} disabled={state === "loading"}>{state === "loading" ? "Loading the sample agency…" : "Load the sample agency"}</button>
      {state !== "idle" && state !== "loading" && <p role="alert" className="field-error">{state} Nothing was saved. <button className="btn btn-text" onClick={load}>Try again</button></p>}
    </div>
  );
}
