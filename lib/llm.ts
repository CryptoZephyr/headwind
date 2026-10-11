import { z } from "zod";
import { modelClient, modelName } from "./telemetry";

export interface EvidenceForModel {
  id: string;
  provenance: string;
  sourceDate: string | null;
  summary: string;
}

const OUTCOME_WORDS = /\b(pause[sd]?|pausing|freeze|frozen|cancel(?:led|ed|s)?|on hold|filled|lost|closed|withdrawn|shelved|scrapped|halted|no longer (?:be )?(?:open|active|hiring|going ahead|available)|not going ahead|stopped hiring)\b/i;
const HEDGE_WORDS = /\b(not|no|never|unconfirmed|unverified|uncertain|unclear|unknown|whether|if|may|might|could|possibly|possible|perhaps|cannot|can't|doesn't|didn't|isn't|wasn't|without|insufficient|inconclusive|unproven|lacks?|lacking|nothing|none)\b/i;
const CLAUSE_BREAK = /[;:()\u2014]|\s-\s|\b(?:and|but|while|whereas|although|though|which|so(?! far)|because|yet)\b/i;
const FINITE_VERB = /\b(is|was|were|are|has|have|had|been|be|shows?|showed|confirms?|confirmed|says?|said|does|did)\b/i;
const CONTINUATION = /^\s*(that|whether|if)\b/i;
const INFERENCE = /\b(indicat(?:e|es|ed|ing)|suggest(?:s|ed|ing)?|impl(?:y|ies|ied|ying)|mean(?:s|ing)?|points? to|a sign that)\b/gi;
const NEGATED_INFERENCE = /(?:\bnot|\bno|\bnever|\bnothing|n't)\s+(?:\w+\s+)?$/i;
const COORDINATED_INFERENCE = /^\s*(?:or|nor)\s+(?:indicat|suggest|impl|mean|point|show|prove)/i;
const LIST_FILLER = /\b(?:or|and|nor|either|neither|even|possibly|perhaps|maybe|been|being)\b/gi;

function inferredOutcome(seg: string, outcomeIndex: number, carried: boolean): boolean {
  return [...seg.slice(0, outcomeIndex).matchAll(INFERENCE)].some((m) => !NEGATED_INFERENCE.test(seg.slice(0, m.index)) && !(carried && /\b(?:or|nor)\b/i.test(seg.slice(0, m.index)) && seg.slice(0, m.index).replace(LIST_FILLER, "").trim() === "") && !/\bnot\b|\bnever\b|n't\b|\bunclear\b|\bwhether\b/i.test(seg.slice(m.index! + m[0].length, outcomeIndex)));
}

function unsupportedInClause(clause: string): boolean {
  let carried = false;
  for (const seg of clause.split(",")) {
    const outcomes = [...seg.matchAll(new RegExp(OUTCOME_WORDS.source, "gi"))];
    const listItem = outcomes.length > 0 && seg.replace(new RegExp(OUTCOME_WORDS.source, "gi"), "").replace(LIST_FILLER, "").replace(/[^\w\s]/g, "").trim() === "";
    const inherits: boolean = carried && (CONTINUATION.test(seg) || listItem || COORDINATED_INFERENCE.test(seg));
    if (outcomes.some((m) => inferredOutcome(seg, m.index!, carried) || (!inherits && !HEDGE_WORDS.test(seg.slice(0, m.index))))) return true;
    const parenthetical = outcomes.length === 0 && !FINITE_VERB.test(seg);
    carried = inherits || (carried && parenthetical) || HEDGE_WORDS.test(seg);
  }
  return false;
}

export function containsUnsupportedClaim(text: string, agencySuppliedStates: boolean): boolean {
  if (agencySuppliedStates) return false;
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  return sentences.some((s) => s.split(CLAUSE_BREAK).some((c) => c && unsupportedInClause(c)));
}

const OUTCOME_ROOTS: [RegExp, RegExp][] = [
  [/paus|on hold/i, /paus|on hold|hold/i],
  [/cancel|scrap|withdrawn|shelved|halted|not going ahead/i, /cancel|scrap|withdr|shelv|halt|not going ahead/i],
  [/filled|lost|closed/i, /fill|lost|close|hired|placed/i],
  [/freez|frozen|stopped hiring/i, /freez|frozen|stopped hiring/i],
  [/no longer/i, /no longer/i],
];

export function questionRaisesUnsupportedOutcome(question: string, agencyText: string, roleTitle = ""): boolean {
  const title = roleTitle.trim();
  const asked = title ? question.replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ") : question;
  return [...asked.matchAll(new RegExp(OUTCOME_WORDS.source, "gi"))].some((m) => {
    const root = OUTCOME_ROOTS.find(([q]) => q.test(m[0]));
    return !(root ? root[1] : new RegExp(m[0], "i")).test(agencyText);
  });
}

export const NOTE_ATTEMPTS = 3;

async function askJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<{ value: T; tokens: number }> {
  const res = await modelClient().chat.completions.create({
    model: modelName(),
    temperature: 0,
    max_tokens: 700,
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

export interface RejectedDraft {
  raw: string;
  reason: string;
}

export class ModelOutputError extends Error {
  constructor(message: string, readonly raw: string, readonly rejected: RejectedDraft[] = []) {
    super(message);
  }
}

const CaseNoteSchema = z.object({
  summary: z.string().min(1).max(1200),
  question: z.string().min(1).max(400),
  evidence_ids: z.array(z.string()).min(1),
});

export type CaseNote = z.infer<typeof CaseNoteSchema>;

export async function draftCaseNote(input: {
  roleTitle: string;
  clientName: string;
  stage: string;
  missing: string[];
  requiredFacts?: string[];
  evidence: EvidenceForModel[];
}): Promise<{ note: CaseNote; tokens: number; calls: number; rejected?: RejectedDraft[] }> {
  const system = [
    "You help a recruitment agency owner review placement fees in a cash forecast.",
    "Write a short neutral summary of what the evidence shows and one question the account manager should ask the client.",
    "Company-level hiring numbers and a missing public listing are observations only. They never prove a specific role was paused, cancelled or filled, so don't draw conclusions about the role from them.",
    "Make the question a neutral one about the role's current status, without listing possible outcomes.",
    "Required facts are computed from the records and are appended to your summary word for word; don't repeat or contradict them.",
    "Only cite evidence IDs from the list.",
    'Shape: {"summary": string, "question": string, "evidence_ids": string[]}',
  ].join("\n");
  const allowed = new Set(input.evidence.map((e) => e.id));
  const agencySuppliedStates = input.evidence.some((e) => e.provenance === "agency_supplied" && OUTCOME_WORDS.test(e.summary));
  const agencyText = input.evidence.filter((e) => e.provenance === "agency_supplied").map((e) => e.summary).join(" ");

  function validate(value: CaseNote): string | null {
    const unknownIds = value.evidence_ids.filter((id) => !allowed.has(id));
    if (unknownIds.length) return `The model cited evidence that doesn't exist: ${unknownIds.join(", ")}. Copy IDs exactly from this list: ${[...allowed].join(", ")}.`;
    if (containsUnsupportedClaim(value.summary, agencySuppliedStates)) return "The model's summary claimed an outcome the evidence doesn't confirm.";
    if (questionRaisesUnsupportedOutcome(value.question, agencyText, input.roleTitle)) return "The model's question raised an outcome (paused, cancelled, filled...) that no agency record mentions; ask about the role's status neutrally.";
    return null;
  }

  const requiredFacts = input.requiredFacts ?? [];
  const baseUser = JSON.stringify({ role: input.roleTitle, client: input.clientName, stage: input.stage, open_questions: input.missing, required_facts: requiredFacts, evidence: input.evidence });
  let tokens = 0;
  let rejection: ModelOutputError | null = null;
  const rejected: RejectedDraft[] = [];
  for (let calls = 1; calls <= NOTE_ATTEMPTS; calls++) {
    const user: string = rejection ? `${baseUser}\n\nYour previous answer was rejected: ${rejection.message} Answer again.` : baseUser;
    try {
      const r: { value: CaseNote; tokens: number } = await askJson(system, user, CaseNoteSchema);
      tokens += r.tokens;
      const problem = validate(r.value);
      if (!problem) return { note: withRequiredFacts(r.value, requiredFacts), tokens, calls, rejected };
      rejection = new ModelOutputError(problem, JSON.stringify(r.value));
    } catch (e) {
      if (!(e instanceof ModelOutputError)) throw e;
      rejection = e;
    }
    rejected.push({ raw: rejection.raw, reason: rejection.message });
  }
  throw new ModelOutputError(rejection!.message, rejection!.raw, rejected);
}

export function withRequiredFacts(note: CaseNote, facts: string[]): CaseNote {
  const extra = facts.filter((f) => !note.summary.includes(f));
  return extra.length ? { ...note, summary: [note.summary, ...extra].join(" ") } : note;
}

export function evidenceFallbackNote(input: { observation: string; caveats: string[]; evidence: EvidenceForModel[]; question: string }): CaseNote {
  const agency = input.evidence.filter((e) => e.provenance === "agency_supplied").map((e) => e.summary);
  return {
    summary: [input.observation, ...input.caveats, ...(agency.length ? [`Agency-supplied records: ${agency.join(" ")}`] : [])].join(" "),
    question: input.question,
    evidence_ids: input.evidence.map((e) => e.id),
  };
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
