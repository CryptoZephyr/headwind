"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Nav = { group: string; items: { href: string; title: string }[] }[];

function Links({ nav, path }: { nav: Nav; path: string }) {
  return (
    <>
      {nav.map((g) => (
        <div key={g.group} className="docs-group">
          <p className="eyebrow">{g.group}</p>
          <ul>
            {g.items.map((i) => (
              <li key={i.href}><Link href={i.href} aria-current={path === i.href ? "page" : undefined}>{i.title}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function DocsSidebar({ nav }: { nav: Nav }) {
  const path = usePathname();
  const current = nav.flatMap((g) => g.items).find((i) => i.href === path);
  return (
    <>
      <nav className="docs-nav docs-nav-desktop" aria-label="Documentation"><Links nav={nav} path={path} /></nav>
      <details className="docs-nav-mobile" key={path}>
        <summary>Docs menu{current && <span className="meta"> · {current.title}</span>}</summary>
        <nav aria-label="Documentation"><Links nav={nav} path={path} /></nav>
      </details>
    </>
  );
}
