import { createHash, randomUUID } from "node:crypto";

export function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function stableId(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}_${sha256(parts.join("|")).slice(0, 16)}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
