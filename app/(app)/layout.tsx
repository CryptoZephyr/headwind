import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { ZoneLink } from "@/components/ZoneLink";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="wrap">
          <Brand href="/app" />
          <nav className="topnav" aria-label="App">
            <Link href="/app">Overview</Link>
            <Link href="/import">Import</Link>
            <ZoneLink href="/docs">Docs</ZoneLink>
            <form method="post" action="/api/logout">
              <button type="submit" className="linklike">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main id="main" className="wrap app-main">{children}</main>
    </>
  );
}
