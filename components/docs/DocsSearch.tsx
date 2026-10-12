"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface SearchEntry { href: string; title: string; group: string; text: string }

export function DocsSearch({ entries }: { entries: SearchEntry[] }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return entries.filter((e) => `${e.title} ${e.text}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, entries]);
  return (
    <div className="docs-search" role="search">
      <label htmlFor="docs-q" className="sr-only">Search the docs</label>
      <input id="docs-q" type="text" placeholder="Search the docs" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {q.trim().length >= 2 && (
        <div className="docs-hits">
          <p className="sr-only" aria-live="polite">{hits.length} result{hits.length === 1 ? "" : "s"}</p>
          {hits.length === 0 ? <p className="meta">No pages mention &ldquo;{q}&rdquo;.</p> : (
            <ul>{hits.map((h) => <li key={h.href}><Link href={h.href} onClick={() => setQ("")}>{h.title}</Link> <span className="meta">{h.group}</span></li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
