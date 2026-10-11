import { NextResponse } from "next/server";
import { publicUrl, SESSION_COOKIE, sameText, sessionToken } from "@/lib/auth";
import { clearFailures, clientKey, isLockedOut, recordFailure } from "@/lib/login-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = process.env.HEADWIND_PASSWORD;
  const form = await req.formData();
  const given = String(form.get("password") ?? "");
  const back = (error: string) => NextResponse.redirect(publicUrl(req, `/login?error=${error}`), 303);
  if (!password) return back("unset");
  const key = clientKey(req);
  if (isLockedOut(key)) return back("locked");
  if (!sameText(await sessionToken(given), await sessionToken(password))) {
    recordFailure(key);
    return back(isLockedOut(key) ? "locked" : "wrong");
  }
  clearFailures(key);
  const res = NextResponse.redirect(publicUrl(req, "/"), 303);
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl(req, "/").protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
