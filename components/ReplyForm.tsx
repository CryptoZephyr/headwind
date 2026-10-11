"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReplyForm({ caseId, sample }: { caseId: string; sample: string | null }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [replyDate, setReplyDate] = useState(new Date().toISOString().slice(0, 10));
  const [simulated, setSimulated] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "done" | "error"; message?: string }>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, replyDate, body, isSimulated: simulated, source: simulated ? "Simulated client email" : "Client email" }),
      });
      const data = (await res.json()) as { error?: string; duplicate?: boolean; interpretation?: { outcome: string } | null };
      if (!res.ok) throw new Error(data.error || "Couldn't save the reply.");
      setState({
        kind: "done",
        message: data.duplicate ? "This reply was already recorded, so nothing changed." : `Saved. Read as: ${data.interpretation?.outcome ?? "unclear"}. A reassessment is queued.`,
      });
      setBody("");
      router.refresh();
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't save the reply." });
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Client reply
        <br />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} cols={70} required />
      </label>
      <br />
      <label>
        Reply date <input type="date" value={replyDate} onChange={(e) => setReplyDate(e.target.value)} required />
      </label>{" "}
      <label>
        <input type="checkbox" checked={simulated} onChange={(e) => setSimulated(e.target.checked)} /> Simulated reply
      </label>{" "}
      {sample && (
        <button type="button" onClick={() => { setBody(sample); setSimulated(true); }}>
          Use sample reply
        </button>
      )}{" "}
      <button type="submit" disabled={state.kind === "saving" || !body.trim()}>
        {state.kind === "saving" ? "Reading reply…" : "Save reply"}
      </button>
      {state.message && <p role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>}
    </form>
  );
}
