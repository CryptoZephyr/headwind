import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorMessage, fail } from "@/lib/http";
import { enqueueRun } from "@/lib/review";
import { overview } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(overview(getDb()));
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function POST(req: Request) {
  try {
    const { agencyId } = (await req.json()) as { agencyId?: string };
    if (!agencyId) return fail("Missing agency.");
    return NextResponse.json({ runId: enqueueRun(getDb(), agencyId) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
