"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OUTCOME_LABEL } from "@/lib/format";

export function ReplyForm({ caseId, roleLabel, sample, isSample }: { caseId: string; roleLabel: string; sample: string | null; isSample: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [replyDate, setReplyDate] = useState(new Date().toISOString().slice(0, 10));
  const [simulated, setSimulated] = useState(isSample);
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
      const data = (await res.json()) as { error?: string; duplicate?: boolean; interpretation?: { outcome: string; paused_until?: string | null } | null };
      if (!res.ok) throw new Error(data.error || "Couldn't save the reply.");
      const reading = data.interpretation ? `${OUTCOME_LABEL[data.interpretation.outcome] ?? data.interpretation.outcome}${data.interpretation.paused_until ? ` until ${data.interpretation.paused_until}` : ""}` : "unclear";
      setState({
        kind: "done",
        message: data.duplicate ? "This reply was already saved, so nothing changed." : `Reply saved. Read as: ${reading}. Headwind is reassessing this role only; the forecast updates when that finishes.`,
      });
      setBody("");
      router.refresh();
    } catch (err) {
      setState({ kind: "error", message: `${err instanceof Error ? err.message : "Couldn't save the reply."} Your text is kept, so you can try again.` });
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (o && state.kind === "done") setState({ kind: "idle" }); }}>
      <Dialog.Trigger asChild>
        <button type="button" className="btn btn-secondary">Paste client reply</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet" aria-describedby="sheet-desc">
          <div className="sheet-head">
            <Dialog.Title asChild><h2>Client reply</h2></Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" aria-label="Close"><X size={20} aria-hidden="true" /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="sheet-desc" className="small muted">For {roleLabel}. Saving it updates only this role and keeps its history.</Dialog.Description>
          {state.kind === "done" ? (
            <div className="stack">
              <p role="status" className="banner">{state.message}</p>
              <Dialog.Close asChild><button type="button" className="btn btn-primary">Done</button></Dialog.Close>
            </div>
          ) : (
            <form onSubmit={submit} className="stack">
              <div>
                <label htmlFor={`body-${caseId}`}>Reply text</label>
                <textarea id={`body-${caseId}`} value={body} onChange={(e) => setBody(e.target.value)} rows={7} required />
              </div>
              <div>
                <label htmlFor={`date-${caseId}`}>Date the client replied</label>
                <input id={`date-${caseId}`} type="date" value={replyDate} onChange={(e) => setReplyDate(e.target.value)} required />
              </div>
              <label className="check">
                <input type="checkbox" checked={simulated} onChange={(e) => setSimulated(e.target.checked)} /> This is a simulated reply (not from a real client)
              </label>
              {sample && (
                <button type="button" className="btn-text btn" onClick={() => { setBody(sample); setSimulated(true); }}>
                  Fill in the sample reply
                </button>
              )}
              {state.kind === "error" && <p role="alert" className="field-error">{state.message}</p>}
              <div className="btn-row">
                <button type="submit" className="btn btn-primary" disabled={state.kind === "saving" || !body.trim()}>
                  {state.kind === "saving" ? "Reading the reply…" : "Save reply"}
                </button>
                <Dialog.Close asChild><button type="button" className="btn btn-secondary">Cancel</button></Dialog.Close>
              </div>
              <p className="sr-only" aria-live="polite">{state.kind === "saving" ? "Reading the reply" : ""}</p>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
