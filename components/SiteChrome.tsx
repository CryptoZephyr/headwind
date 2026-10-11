import Link from "next/link";
import { Brand } from "@/components/Brand";

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="wrap">
        <Brand />
        <nav className="topnav" aria-label="Site">
          <Link href="/#how">How it works</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="footer-cta">
          <h2>See what this week&apos;s review would ask.</h2>
          <Link className="btn btn-inverse" href="/#sample">See a sample review</Link>
        </div>
        <nav aria-label="Footer" className="footer-nav">
          <Link href="/#sample">Sample review</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/docs">Documentation</Link>
          <Link href="/#faq">FAQ</Link>
          <Link href="/login">Sign in</Link>
          <a href="https://github.com/CryptoZephyr/headwind">Source on GitHub</a>
        </nav>
        <p className="footer-meta">Headwind · MIT licensed · Sample figures on this site are made up and labelled.</p>
      </div>
    </footer>
  );
}
