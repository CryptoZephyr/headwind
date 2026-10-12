import { Brand } from "@/components/Brand";
import { ZoneLink } from "@/components/ZoneLink";

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="wrap">
        <Brand />
        <nav className="topnav" aria-label="Site">
          <ZoneLink href="/#how">How it works</ZoneLink>
          <ZoneLink href="/docs">Docs</ZoneLink>
          <ZoneLink href="/login">Sign in</ZoneLink>
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
          <ZoneLink className="btn btn-inverse" href="/#sample">See a sample review</ZoneLink>
        </div>
        <nav aria-label="Footer" className="footer-nav">
          <ZoneLink href="/#sample">Sample review</ZoneLink>
          <ZoneLink href="/#how">How it works</ZoneLink>
          <ZoneLink href="/docs">Documentation</ZoneLink>
          <ZoneLink href="/#faq">FAQ</ZoneLink>
          <ZoneLink href="/login">Sign in</ZoneLink>
          <a href="https://github.com/CryptoZephyr/headwind">Source on GitHub</a>
        </nav>
        <p className="footer-meta">Headwind · MIT licensed · Sample figures on this site are made up and labelled.</p>
      </div>
    </footer>
  );
}
