import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Headwind", description: "Weekly revenue review for contingent-fee recruitment agencies" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16, lineHeight: 1.5 }}>
        <header>
          <Link href="/"><strong>Headwind</strong></Link> · <Link href="/import">Import</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
