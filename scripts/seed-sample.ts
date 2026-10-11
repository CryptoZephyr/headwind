import "../lib/env";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db";
import { previewImport } from "../lib/importer";
import { commitImport } from "../lib/store";

const dir = path.join(process.cwd(), "fixtures", "sample");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
const preview = previewImport({ clients: read("clients.csv"), mandates: read("mandates.csv"), finance: read("finance.csv"), updates: read("updates.csv") });
if (preview.errors.length) {
  console.error(preview.errors);
  process.exit(1);
}
const id = commitImport(getDb(), preview, { isSample: true });
console.log(`Sample agency imported: ${id}`);
