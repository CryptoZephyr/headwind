import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";

export function Callout({ kind = "note", title, children }: { kind?: "note" | "warning" | "boundary" | "limit"; title: string; children: ReactNode }) {
  return (
    <aside className={`callout callout-${kind}`} role="note">
      <p className="callout-title">{title}</p>
      <div>{children}</div>
    </aside>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="code">
      <div className="code-head"><span className="meta">{label ?? "Shell"}</span><CopyButton text={code} /></div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  );
}

export function ErrorReference({ rows }: { rows: { symptom: string; cause: string; check: string; fix: string }[] }) {
  return (
    <div className="err-ref">
      {rows.map((r) => (
        <div key={r.symptom} className="err-row">
          <p><strong>{r.symptom}</strong></p>
          <dl>
            <dt>Likely cause</dt><dd>{r.cause}</dd>
            <dt>How to check</dt><dd>{r.check}</dd>
            <dt>How to fix</dt><dd>{r.fix}</dd>
          </dl>
        </div>
      ))}
    </div>
  );
}

export function DeploymentReference({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
