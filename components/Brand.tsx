import Image from "next/image";
import Link from "next/link";

export function Brand({ href = "/", size = 32 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="brand" aria-label="Headwind home">
      <Image src="/brand/headwind-windfold-logo.png" alt="" width={size} height={size} priority />
      <span>Headwind</span>
    </Link>
  );
}
