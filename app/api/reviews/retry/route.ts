import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorMessage, fail } from "@/lib/http";
import { RetryBlockedError, retryRun } from "@/lib/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { runId } = (await req.json()) as { runId?: string };
    if (!runId) return fail("Missing review.");
    if (!retryRun(getDb(), runId)) return fail("This review isn't stopped, so there's nothing to retry.", 409);
    return NextResponse.json({ runId });
  } catch (e) {
    if (e instanceof RetryBlockedError) return fail(e.message, 409);
    return fail(errorMessage(e), 500);
  }
}
