# Headwind evaluation report (2026-10-11)

What this covers: the 10 decision cases, the two recovery failures (a cfo.ai write whose answer is lost, and a worker crash), and the before/after check on the case-note fix. Each expected result was written down before the run. Live runs and controlled replays are reported separately.

This is not evidence of long-term forecast accuracy, early warning, money saved or customer demand. All agency data is the labelled sample, and every client reply below is simulated.

## 1. The 10 decision cases (controlled replay)

How it was run: `npx vitest run tests/engine.test.ts -t "decision cases"`. The real review engine runs on the sample import. Crustdata and cfo.ai are replaced by in-memory stand-ins, so each case's evidence can be set exactly.

| # | Case | Expected (written first) | Result |
|---|------|--------------------------|--------|
| 1 | Listing absent, offer accepted | Keep the fee assumption, no task, Reviewed receipts 17,000 | Pass |
| 2 | Dated client pause confirmed | Outcome `client_pause`, Reviewed receipts fall to 12,000 | Pass |
| 3 | Listing absent, outcome unknown | Outcome `unknown`, 1 open confirmation task, Downside receipts 8,000 | Pass |
| 4 | Role reposted under a new listing | Listing evidence says "still lists", no pause, no "not found" | Pass |
| 5 | Ambiguous company match | Match blocked, listing check `blocked_by_match`, no change to Reviewed | Pass |
| 6 | Provider response incomplete | "Didn't finish" recorded, no "not found" claim, task opened | Pass |
| 7 | No earlier listing snapshot | Listing `not_checked`, no removal claimed | Pass |
| 8 | Company-wide decline but the client confirms the role | Role-specific reply wins (`unreviewed`, no task), company decline kept as evidence, fee kept | Pass |
| 9 | Later reply contradicts the earlier decision | Decisions read `unknown` → `client_pause` → `unreviewed`, history kept, Reviewed back to 17,000 | Pass |
| 10 | Duplicate reply and a concurrent rerun | Duplicate ignored, second worker can't claim, exactly 1 cfo.ai write, 1 stored reply | Pass |

**10 of 10 cases met their expected outcome.**

Counted across the 10 cases:
- Unsupported pause decisions: **0 of 10.**
- Cases that needed a confirmation task but didn't get one: **0 of 3** (cases 3, 6 and the stale-confirmation part of 4).
- Duplicate financial operations: **0** (case 10).

Limits:
- Case 7 avoids the false claim, but it doesn't start a fresh listing baseline from Crustdata. A role is only checked when the agency supplies when it last saw the listing.
- Case 8 keeps both pieces of evidence, but the case note doesn't spell out the conflict in words.

The full suite has **51 of 51 tests passing**: these 10 cases plus 41 existing tests for recovery, imports, sign-in and the calculations.

## 2. Live recovery test on the deployed server

How it was run:
- **Where:** the deployed EC2 server (code from `main`) against live cfo.ai.
- **Data:** a copy of the production database, with its own synthetic cfo.ai scenarios ("Headwind Reviewed/Downside (Recovery test copy)"). The hosted sample and cfo.ai Main were not touched.
- **Trigger:** a simulated client reply on M-103 ("filled through another agency") queued a reassessment.
- **Script:** `deploy/recovery-test.sh`. Full log: `eval/results/live-recovery-2026-10-11.log`.

| Step | Expected | Observed |
|------|----------|----------|
| Worker 1 with `HEADWIND_FAULTS=crash_after_assess` | Saves the assessment, exits without releasing the lease | Exit 75, `assess` saved, lease still held by the dead worker |
| Lease expires (125 s), worker 2 with `cfo_timeout_after_write` | Skips `assess`. The Reviewed write lands, the answer is lost, and the operation is marked `unknown` | Resumed at `forecast`, `assess` not rerun (1 decision). cfo.ai changelog 280124 shows the write. Operation `unknown`, run `retrying` |
| Worker 3, no faults | Checks cfo.ai first and doesn't resend. Writes Downside, then verifies both by readback | Reviewed: "inspection showed the write had landed, so it was not resent". Downside written (280126) and verified. Run `complete` |

Counts:
- Steps completed after the crash: **3 of 3** (`assess` kept, `forecast` and `sync_cfo` finished).
- Duplicate cfo.ai writes: **0.** The Reviewed changelog has exactly one receipts edit (17,000 → 8,000).
- Duplicate decisions: **0** (1 decision for this run).
- Crustdata credits used: **0** (a reassessment doesn't fetch evidence).
- Model calls: **1** (reading the reply).
- Elapsed time: 09:45:18 to 09:47:47 UTC, including the 125 s lease wait.

neatlogs traces (Headwind project `f3daaa51-3277-4f86-8109-b5c7401359e5`):
- Lost-answer attempt: `077ce0ebcef8363825464dd9ac3dee8f`, status ERROR, 5 spans, 4 tool calls.
- Recovery: `b8d505b7b040aa58fefac7ec1de106a6`, status OK, 6 spans, 5 tool calls.

Both were read back as finalized.

## 3. Case-note fix: before and after

The failure:
- **What happened:** the first live weekly review (`run_7cd5b87fd4544ef1`) stopped because the model's case note was rejected as claiming an unconfirmed outcome. The old check rejected any summary containing words like "paused", even when the sentence said the pause was not confirmed. The review couldn't finish.
- **The fix:** Entire checkpoint `01M4M8H1EAF08XSE3YWHHXGTT4`, commit `3d91bea`, in `lib/llm.ts`. It checks claims sentence by sentence, allows hedged wording, retries once with the reason for the rejection, and otherwise falls back to a fixed note.

How it was measured:
- **Script:** `scripts/eval-case-notes.ts`, comparing the pre-fix code (`eval/baseline-llm.ts`, unchanged from `3d91bea^`) with the current code.
- **Inputs:** the same evidence as that run's two open cases, M-102 and M-103.
- **Size:** 10 trials each, nova-micro.
- **Results file:** `eval/results/case-notes-2026-10-11T09-44-13-807Z.json`.

| | Before | After |
|---|---|---|
| Case notes drafted | 20 | 20 |
| Accepted | 11 | 20 |
| Review stopped by a rejected note | **9 (45%)** | **0** |
| Needed the retry / fixed note | n/a | 0 / 0 |
| Saved notes with an unsupported outcome claim | 0 | 0 |
| Model calls | 20 | 20 |

Example traces (Headwind neatlogs project, all finalized):
- Before, rejected: `4daa34abfc3f21e718ed4352531e356f`
- After, accepted: `6be86f1b7f008c928c0559314b670b70`
- Every other trial's trace ID is in the results file.

The old failed run's own trace (`2f6c2b730878272bd73d83e0268405f3`) went to the earlier project key, where traces never finished processing. This replay recreates it on the working project.

Token counts in the results file leave out rejected notes (the old code throws away the usage). The traces do show them, for example 376 tokens for the rejected example.

## 4. Usage this session

- Crustdata credits: 0 (this evaluation is replay or reassessment only).
- Model calls: 40 for the case-note comparison and 1 for the reply.
- cfo.ai writes: 2 recovery-test scenario tables, 2 recovery-test edits, and 1 business-plan table.

## 5. Headwind business plan (cfo.ai)

The plan is in a separate synthetic scenario, "Headwind business plan (hypothesis)", built by `scripts/cfo-business-plan.ts`:
- **Write:** dry run first, then changelog 280133. All 26 rows were read back.
- **Scope:** the scenario is fully separate from the agency cash model and from Main.
- **Revenue:** paying agencies × Headwind's price. Agency placement fees are never counted as Headwind revenue.

| Line | Monthly USD | Basis |
|---|---|---|
| Revenue (10 agencies × 300) | 3,000 | Price and adoption are hypotheses |
| Crustdata + model (10 × 4 reviews × (6 credits × 0.05 + 0.01)) | 12.40 | 6 credits per review measured; price per credit unverified |
| Support labor (1 h per agency at 50) | 500 | Hypothesis |
| Contribution A: each agency pays its own cfo.ai | 2,487.60 | |
| cfo.ai Growth plan, if Headwind pays | 1,500 | Price shown on the trial |
| Contribution B: Headwind pays one cfo.ai plan | 987.60 | |
| Fixed: EC2 + disk 17, neatlogs 0 (unverified), setup 300, acquisition 400 | 717 | |
| Net A / Net B | 1,770.60 / 270.60 | Runway with 5,000 starting funds: not burning under B |

Decision: **each agency brings its own cfo.ai account (arrangement A).**
- It keeps the agency's finance data in the agency's own workspace.
- It avoids one shared $1,500 plan that leaves only about $270 a month under these guesses.
- It hasn't been confirmed that one cfo.ai plan could legally or technically serve several agencies.

Not validated: price, willingness to pay, adoption, Crustdata's paid credit price and neatlogs pricing.
