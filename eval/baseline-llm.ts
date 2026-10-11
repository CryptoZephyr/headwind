// Case-note step as it was before commit 3d91bea, kept unchanged so scripts/eval-case-notes.ts can compare both versions on the same inputs.
import { z } from "zod";
import { modelClient, modelName } from "../lib/telemetry";

export interface EvidenceForModel {
  id: string;
  provenance: string;
  sourceDate: string | null;
  summary: string;
}

const CLAIM_WORDS = /\b(paused|frozen|freeze|cancell?ed|on hold|lost|filled)\b/i;

async function askJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<{ value: T; tokens: number }> {
  const res = await modelClient().chat.completions.create({
    model: modelName(),
    temperature: 0,
    max_tokens: 400,
    messages: [
      { role: "system", content: `${system}\nAnswer with one JSON object only, no other text.` },
      { role: "user", content: user },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new ModelOutputError("The model didn't return a JSON answer.", text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ModelOutputError("The model returned malformed JSON.", text);
  }
  const out = schema.safeParse(parsed);
  if (!out.success) throw new ModelOutputError(`The model's answer was missing fields: ${out.error.issues.map((i) => i.path.join(".")).join(", ")}`, text);
  return { value: out.data, tokens: res.usage?.total_tokens ?? 0 };
}

export class ModelOutputError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
  }
}

const CaseNoteSchema = z.object({
  summary: z.string().min(1).max(600),
  question: z.string().min(1).max(400),
  evidence_ids: z.array(z.string()).min(1),
});

export type CaseNote = z.infer<typeof CaseNoteSchema>;

export async function draftCaseNote(input: {
  roleTitle: string;
  clientName: string;
  stage: string;
  missing: string[];
  evidence: EvidenceForModel[];
}): Promise<{ note: CaseNote; tokens: number }> {
  const system = [
    "You help a recruitment agency owner review placement fees in a cash forecast.",
    "Write a short neutral summary of what the evidence shows and one question the account manager should ask the client.",
    "Company-level hiring numbers and a missing public listing are observations only. They never prove a specific role was paused, cancelled or filled.",
    "Only cite evidence IDs from the list.",
    'Shape: {"summary": string, "question": string, "evidence_ids": string[]}',
  ].join("\n");
  const user = JSON.stringify({ role: input.roleTitle, client: input.clientName, stage: input.stage, open_questions: input.missing, evidence: input.evidence });
  const { value, tokens } = await askJson(system, user, CaseNoteSchema);
  const allowed = new Set(input.evidence.map((e) => e.id));
  const unknownIds = value.evidence_ids.filter((id) => !allowed.has(id));
  if (unknownIds.length) throw new ModelOutputError(`The model cited evidence that doesn't exist: ${unknownIds.join(", ")}`, JSON.stringify(value));
  const hasClientConfirmation = input.evidence.some((e) => e.provenance === "agency_supplied" && CLAIM_WORDS.test(e.summary));
  if (!hasClientConfirmation && CLAIM_WORDS.test(value.summary)) {
    throw new ModelOutputError("The model's summary claimed an outcome the evidence doesn't confirm.", value.summary);
  }
  return { note: value, tokens };
}

const ReplySchema = z.object({
  outcome: z.enum(["client_pause", "placed_elsewhere", "still_active", "unclear"]),
  paused_until: z.string().nullable(),
  quote: z.string().min(1),
});

export type ReplyRead = z.infer<typeof ReplySchema>;

export async function readClientReply(input: { roleTitle: string; replyDate: string; body: string }): Promise<{ read: ReplyRead; tokens: number }> {
  const system = [
    "A recruitment client replied to a question about whether a role is still open.",
    "Classify the reply: client_pause (hiring paused or on hold), placed_elsewhere (filled another way or cancelled), still_active, or unclear.",
    "If paused with a restart date, give paused_until as YYYY-MM-DD, otherwise null.",
    "quote must be copied exactly from the reply and support the classification.",
    'Shape: {"outcome": string, "paused_until": string|null, "quote": string}',
  ].join("\n");
  const { value, tokens } = await askJson(system, JSON.stringify({ role: input.roleTitle, reply_date: input.replyDate, reply: input.body }), ReplySchema);
  if (!input.body.includes(value.quote)) throw new ModelOutputError("The model's quote isn't in the client's reply.", JSON.stringify(value));
  if (value.paused_until !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(value.paused_until) || Number.isNaN(Date.parse(value.paused_until)))) {
    throw new ModelOutputError("The model gave an invalid restart date.", JSON.stringify(value));
  }
  if (value.outcome !== "client_pause" && value.paused_until !== null) value.paused_until = null;
  return { read: value, tokens };
}
