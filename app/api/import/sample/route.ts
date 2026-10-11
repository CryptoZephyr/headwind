import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { previewImport } from "@/lib/importer";
import { errorMessage, fail } from "@/lib/http";
import { commitImport } from "@/lib/store";

export const runtime = "nodejs";

const dir = path.join(process.cwd(), "fixtures", "sample");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

export async function GET() {
  return NextResponse.json({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv"), reply: read("reply-M-102.txt") });
}

export async function POST() {
  try {
    const preview = previewImport({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv") });
    return NextResponse.json({ agencyId: commitImport(getDb(), preview, { isSample: true }) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
