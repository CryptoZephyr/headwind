import { Geist_Mono, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import "./theme.css";

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: "Headwind",
  description: "Weekly revenue check for permanent-placement agencies: which expected fees still hold, which need confirming, and what that does to cash.",
  icons: { icon: "/brand/headwind-windfold-logo.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
