import Link from "next/link";
import type { ReactNode } from "react";
import { DOCS, GROUPS, href } from "@/components/docs/content";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const nav = GROUPS.map((g) => ({ group: g, items: DOCS.filter((d) => d.group === g).map((d) => ({ href: href(d), title: d.title })) }));
  const entries = DOCS.map((d) => ({ href: href(d), title: d.title, group: d.group, text: `${d.lede} ${d.sections.map((s) => s.h).join(" ")}` }));
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <SiteHeader />
      <div className="wrap docs">
        <aside className="docs-side">
          <DocsSearch entries={entries} />
          <DocsSidebar nav={nav} />
          <p className="meta"><Link href="/app">Open the app</Link></p>
        </aside>
        <main id="main" className="docs-main">{children}</main>
      </div>
      <SiteFooter />
    </>
  );
}
