import { NextResponse } from "next/server";
import { SESSION_COOKIE, sameText, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = process.env.HEADWIND_PASSWORD;
  const form = await req.formData();
  const given = String(form.get("password") ?? "");
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, req.url), 303);
  if (!password) return back("unset");
  if (!sameText(await sessionToken(given), await sessionToken(password))) return back("wrong");
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
