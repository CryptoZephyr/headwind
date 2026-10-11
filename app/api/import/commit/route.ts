import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { previewImport } from "@/lib/importer";
import { errorMessage, fail } from "@/lib/http";
import { commitImport } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { clients?: string; mandates?: string; finance?: string; updates?: string };
    if (!body.clients || !body.mandates || !body.finance) return fail("Add the clients, mandates and finance files.");
    const preview = previewImport({ clients: body.clients, mandates: body.mandates, finance: body.finance, updates: body.updates });
    if (preview.errors.length) return NextResponse.json({ error: "Some rows still need fixing.", preview }, { status: 422 });
    return NextResponse.json({ agencyId: commitImport(getDb(), preview, { isSample: false }) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
