import { NextResponse, type NextRequest } from "next/server";
import { isSignedIn, publicUrl, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await isSignedIn(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to use Headwind." }, { status: 401 });
  }
  return NextResponse.redirect(publicUrl(req, "/login"));
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
