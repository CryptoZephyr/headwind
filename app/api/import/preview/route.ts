import { NextResponse } from "next/server";
import { previewImport } from "@/lib/importer";
import { errorMessage, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { clients?: string; mandates?: string; finance?: string; updates?: string };
    if (!body.clients || !body.mandates || !body.finance) return fail("Add the clients, mandates and finance files.");
    return NextResponse.json(previewImport({ clients: body.clients, mandates: body.mandates, finance: body.finance, updates: body.updates }));
  } catch (e) {
    return fail(errorMessage(e));
  }
}
