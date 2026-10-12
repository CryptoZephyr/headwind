import { NextResponse, type NextRequest } from "next/server";
import { isSignedIn, PROXY_HEADERS, publicUrl, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const upstream = process.env.HEADWIND_UPSTREAM;
  if (upstream) return forward(req, upstream);
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/_hw/")) return NextResponse.next();
  if (await isSignedIn(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to use Headwind." }, { status: 401 });
  }
  return NextResponse.redirect(publicUrl(req, "/login"));
}

function forward(req: NextRequest, upstream: string) {
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, upstream);
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.set(PROXY_HEADERS.key, process.env.HEADWIND_PROXY_KEY ?? "");
  headers.set(PROXY_HEADERS.host, req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host);
  headers.set(PROXY_HEADERS.proto, req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", ""));
  headers.set(PROXY_HEADERS.client, req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown");
  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: ["/app/:path*", "/import/:path*", "/login", "/api/:path*", "/_hw/:path*"],
};
