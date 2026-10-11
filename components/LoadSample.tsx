"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoadSample() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | string>("idle");
  async function load() {
    setState("loading");
    const res = await fetch("/api/import/sample", { method: "POST" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) return setState(data.error || "Couldn't load the sample agency.");
    setState("idle");
    router.refresh();
  }
  return (
    <p>
      <button onClick={load} disabled={state === "loading"}>{state === "loading" ? "Loading…" : "Load the sample agency"}</button>
      {state !== "idle" && state !== "loading" && <span role="alert"> {state} <button onClick={load}>Try again</button></span>}
    </p>
  );
}
