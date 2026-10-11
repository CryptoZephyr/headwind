import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorMessage, fail } from "@/lib/http";
import { recordClientReply } from "@/lib/reply";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { caseId?: string; replyDate?: string; source?: string; body?: string; isSimulated?: boolean };
    if (!b.caseId || !b.replyDate || !b.body) return fail("Add the reply date and text.");
    return NextResponse.json(await recordClientReply(getDb(), { caseId: b.caseId, replyDate: b.replyDate, source: b.source || "Client email", body: b.body, isSimulated: Boolean(b.isSimulated) }));
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}
