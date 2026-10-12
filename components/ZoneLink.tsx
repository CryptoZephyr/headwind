import type { AnchorHTMLAttributes } from "react";

export function ZoneLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
