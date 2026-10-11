# Headwind evaluation report (2026-10-11)

What this covers, in two separate parts:
- **Part A, controlled tests:** the 10 decision cases, what the model is allowed to see, the case-note fix, and an independent grade of case notes, including fresh held-out cases. Inputs are fixed or stubbed.
- **Part B, completed live reviews:** one full weekly review and one recovery test, both against live Crustdata and live cfo.ai. Each ran once.

Then Part C covers cfo.ai's plan and cost, and Part D lists what is still not shown.

This is not evidence of long-term forecast accuracy, early warning, money saved or customer demand. All agency data is the labelled sample, and every client reply is simulated.

# Part A: Controlled tests

## A1. The 10 decision cases

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

First-time roles and conflicting evidence (cases 7 and 8):
- **Case 7, a role with no earlier listing history:** the first Crustdata check now records only what the live API can support, a starting point: "listed now" (`baseline_found`) or "no matching listing now" (`baseline_absent`). It never claims a removal. The evidence says "This is the first check for this role and Crustdata gives no earlier listing history for it, so no removal or change can be inferred yet."
- The case card now shows this on its own line, outside the collapsed evidence list: "Role listing history: not available before 2026-10-11. Crustdata gives no earlier history for this role, so the 2026-10-11 check is only a starting point…". A role whose listing the agency saw earlier shows "agency saw the listing on 2026-09-15" instead. The case-7 test checks both lines.
- **Case 8, a company-wide decline against a dated client confirmation:** the decision note now spells out the conflict and why the confirmation wins: "Client confirmed on 2026-10-11 that this role is still active. Crustdata shows company-wide open roles fell from 50 on 2026-07-01 to 10 on 2026-10-01. That count covers the whole company and says nothing about this role, so the dated confirmation for this role is used and the fee assumption is kept." The case-8 test checks that wording, the dates and the counts.
- Crustdata's job search only returns current listings with an added date, not a role's past listings, so a first check can't recover earlier history. That's why only a baseline is recorded.

The full suite has **52 of 52 tests passing**: these 10 cases plus 42 tests for recovery, imports, sign-in, calculations and what the model sees.

## A2. What the model sees

How it was run: `npx vitest run tests/engine.test.ts -t "passes agency records"`. The test records every input the model receives in one weekly review plus one client reply, then checks it.

- **Still there (legitimate evidence):** agency records, such as "Two candidates at final interview", and the client's message, "We have paused this role until February."
- **Never there:** fees, probabilities, any percentage, the expected totals (17,000, 12,000, 22,000, 8,000, 13,000), expected receipts, closing cash, the expected outcome, and any "gold" label. 12 banned patterns, 0 found.
- **Where these things live:** the sample files have no outcome-label column at all. The expected outcomes and totals exist only in the test files. Fees and probabilities are the agency's own inputs, and they go only into the fixed maths, never to the model.
- Result: **pass (1 of 1 test).** This checks Headwind's own code path. It can't show what the model provider does with the inputs.


## A3. Case-note fix: before and after

The failure:
- **What happened:** the first live weekly review (`run_7cd5b87fd4544ef1`) stopped because the model's case note was rejected as claiming an unconfirmed outcome. The old check rejected any summary containing words like "paused", even when the sentence said the pause was not confirmed. The review couldn't finish.
- **The fix:** Entire checkpoint `01M4M8H1EAF08XSE3YWHHXGTT4`, commit `3d91bea`, in `lib/llm.ts`. It checks claims sentence by sentence, allows hedged wording, retries once with the reason for the rejection, and otherwise falls back to a fixed note.

How it was measured:
- **Script:** `scripts/eval-case-notes.ts`, comparing the pre-fix code (`eval/baseline-llm.ts`, unchanged from `3d91bea^`) with the current code.
- **Inputs:** the same evidence as that run's two open cases, M-102 and M-103.
- **Size:** 10 trials per case on two cases, so 20 trials per version, nova-micro.
- **Results file:** `eval/results/case-notes-2026-10-11T09-44-13-807Z.json`.

| | Before | After |
|---|---|---|
| Case notes drafted | 20 | 20 |
| Accepted | 11 | 20 |
| Review stopped by a rejected note | **9 (45%)** | **0** |
| Case-note acceptance | **55%** | **100%** |
| Needed the retry / fixed note | n/a | 0 / 0 |
| Saved notes with an unsupported outcome claim | 0 | 0 |
| Model calls | 20 | 20 |

**What 55% → 100% means:** case-note acceptance across 20 trials per version on two cases (M-102 and M-103). It measures whether Headwind's own check let the note through. It does not measure whether the note was right; A4 grades that separately.

Example traces (Headwind neatlogs project, all finalized):
- Before, rejected: `4daa34abfc3f21e718ed4352531e356f`
- After, accepted: `6be86f1b7f008c928c0559314b670b70`
- Every other trial's trace ID is in the results file.

The old failed run's own trace (`2f6c2b730878272bd73d83e0268405f3`) went to the earlier project key, where traces never finished processing. This replay recreates it on the working project.

Token counts in the results file leave out rejected notes (the old code throws away the usage). The traces do show them, for example 376 tokens for the rejected example.

## A4. Independent grade of case notes

The question here is whether accepted notes are actually right about their evidence. Headwind's own check (`containsUnsupportedClaim`) is not used as the judge.

How it was run:
- **Script:** `scripts/grade-case-notes.ts`. **Results:** `eval/results/case-note-grading-2026-10-11T10-25-00-536Z.json`, which holds every note, its grade and the judge's reasons.
- **Writer:** the current code with nova-micro, the same as production.
- **Judge:** a different model, claude-sonnet-4.6, at temperature 0. It gets the evidence list, the open questions and the note, and nothing from Headwind's check. Its rubric is saved in the results file.
- **A note passes only if all four hold:**
  - no unsupported outcome claim (paused, cancelled, filled, closed, "no longer open") without an agency record saying so, whatever hedge words the note uses;
  - company numbers or a missing listing aren't used as proof about this role;
  - every open question is reflected;
  - the case-specific rule is met.
- **A separate check:** cited evidence IDs must exist.

**The 20 notes graded are new.** The 20 accepted notes from A3 can't be recovered: the A3 results file kept each note's status but not its text, and the neatlogs API only returns span metadata, not content. So I redrew 20 notes from the same code, model and inputs (M-102 and M-103, 10 each), and the judge graded those.

### Replay of the two original cases

| Case | Notes | Accepted by Headwind's check | Judge pass | Judge fail | Unsupported outcome claims | Company data used as role proof | Bad evidence IDs |
|---|---|---|---|---|---|---|---|
| M-102 | 10 | 10 | 9 | 1 | 0 | 0 | 0 |
| M-103 | 10 | 10 | 9 | 1 | 0 | 1 | 0 |
| **Total** | **20** | **20** | **18 (90%)** | **2** | **0 of 20** | **1 of 20** | **0 of 20** |

The 2 failures:
- **M-102:** the note didn't mention that the client's last confirmation was 12 days old, which was one of the open questions. A fair failure.
- **M-103:** the note quoted the company-wide drop (48 to 9) next to the missing listing, and asked whether the role was paused, cancelled or filled. The judge read that as leaning on company data. It's borderline; the note doesn't state an outcome.

An earlier attempt at this grading stopped on a judge formatting error before saving, so it isn't the result of record. By its console log it had 15 of 20 passing, with the same kinds of failure. Treat roughly 75–90% as the range, not a fixed figure.

### Fresh held-out cases

These were written for this check and never used during development. 5 notes each.

| Case | What it tests | Accepted by Headwind's check | Judge pass | Main failure |
|---|---|---|---|---|
| H1 misleading hedge | A recruiter note says HR "could not say" if the role is open | 5 of 5 | **3 of 5** | 2 notes put the company decline next to role facts |
| H2 contradictory evidence | Client confirmed the role on 2026-10-09, while company roles fell from 41 to 2 | 5 of 5 | **2 of 5** | 3 notes didn't say the dated confirmation outweighs the company count. 1 asked if the decline was "related to" the role |
| H3 stale confirmation | Last confirmation 41 days ago, but the listing is still live | 5 of 5 | **0 of 5** | All 5 restated the August confirmation without flagging it as stale |
| **Total** | | **15 of 15** | **5 of 15 (33%)** | |

Across all 35 notes, the judge found **0 unsupported outcome claims.** The failures are about **missing caveats,** not false statements.

What this means:
- Headwind's own check accepted all 35 notes, including the 12 the judge failed. So it is a guard against one kind of error (stating an outcome), not a quality grade.
- H2 and H3 are harder than how the live product uses notes:
  - In the product, a role the client confirmed as still active gets no model note. Its decision note is the fixed wording from A1 case 8, which does explain the conflict.
  - In the product, the staleness is also stated in the task's "Why" line, which is fixed wording: "Client last confirmed this role 33 days ago."
  - Even so, the model's summary is shown on the case card, and 0 of 5 flagging staleness is a real weakness.

### Headwind's check against misleading hedges

These are 6 hand-written sentences, labelled before the run.

| Sentence | Really unsupported? | Headwind's check flags it | Judge flags it |
|---|---|---|---|
| "The role was paused, not cancelled." | yes | **no** | yes |
| "The role is no longer open and the client could not confirm a new date." | yes | **no** | yes |
| "Hiring is frozen company-wide, which confirms this role is on hold." | yes | yes | yes |
| "The listing was not found; this is an observation, not proof of a pause." | no | no | no |
| "It is unclear whether the role is still open." | no | no | no |
| "The client may have filled the role elsewhere, so we should confirm." | no | no | **yes** |

- **Headwind's check caught 1 of 3 unsupported sentences.** A hedge word anywhere in the sentence ("not", "could") lets a real claim through.
- The judge caught 3 of 3, with 1 false alarm out of 3 hedged sentences.
- None of the 35 real notes contained this pattern, but the gap is real.

# Part B: Completed live reviews

## B1. One complete weekly review (live Crustdata, live cfo.ai)

How it was run:
- **Script:** `scripts/live-weekly.ts "live weekly test 2026-10-11"`, on a new empty database.
- **Process:** it imports the labelled sample agency (Northbeam Talent, M-101 to M-103), queues one weekly review, and the real worker runs it.
- **cfo.ai:** writes go to two new test scenarios under Main, "Headwind Reviewed (live weekly test 2026-10-11)" and "Headwind Downside (live weekly test 2026-10-11)".
- **Results:** `eval/results/live-weekly-2026-10-11T10-08-12-106Z.json`.

| | Value |
|---|---|
| Run ID | `run_eac5efb75e90428e`, status `complete`, 9.0 s |
| Steps | match_companies, check_listings, assess, forecast, sync_cfo, all done on the first attempt |
| neatlogs trace | `e9280508ace362c91ae376be0c66eb74` (Headwind project). Read back finalized, status OK, 20 spans, 2 model calls, 17 tool calls, 1,212 tokens |
| Crustdata | 6 credits: 3 company lookups (retool.com, linear.app, vercel.com, all matched) and 3 role searches |
| Model | 2 calls (case notes for M-102 and M-103), nova-micro |

The 11 saved source snapshots (full text and payloads are in the results file):
- **Agency-supplied:** the M-101 offer note (2026-10-08), the three candidate records, and the agency's own sighting of the M-103 listing (2026-09-15).
- **Live company counts:**
  - Retool: 14 open roles on 2026-06-01, 3 now.
  - Vercel: 48 on 2026-07-01 and 9 now.
  - Linear: Crustdata returned no count ("unknown").
- **Live role checks:**
  - M-101 and M-102 are first-time roles with no earlier history, so they're recorded as a starting point only (`baseline_absent`).
  - M-103 is compared against the agency's 2026-09-15 sighting and is `not_found`.

Decisions and tasks:
- **M-101:** `offer_accepted`, from the agency records. No task.
- **M-102:** `unknown`. Task for Bola: "USD 10,000 fee at 50% is unconfirmed: Client last confirmed this role 12 days ago."
- **M-103:** `unknown`. Task for Chidi: last confirmed 33 days ago, and the listing was not found.
- No pause, cancellation or fill was claimed from Crustdata data.

Forecast (USD, horizon 2026-11-01 to 2026-11-30):

| Scenario | Expected receipts | Closing cash | Change from Original |
|---|---|---|---|
| Original | 17,000 | 22,000 | n/a |
| Reviewed | 17,000 | 22,000 | none. No client confirmed a change, so imported assumptions stay |
| Downside | 8,000 | 13,000 | −9,000: M-102 (5,000) and M-103 (4,000) are removed while unconfirmed |

These match the approved sample maths for a review before any client reply.

cfo.ai readbacks (both writes `verified` on the first attempt):

| Scenario | Changelog | Read back |
|---|---|---|
| Reviewed | 280221 | opening 20,000, receipts 17,000, recruiter pay 12,000, other 3,000, closing 22,000 |
| Downside | 280223 | opening 20,000, receipts 8,000, recruiter pay 12,000, other 3,000, closing 13,000 |

**Main untouched:** checked read-only afterwards, saved in `eval/results/cfo-plan-and-main-check-2026-10-11.json`.
- Main's history (`Main Scenario#52f`) shows only "Created scenario …" entries for the Headwind test scenarios, and no value edits.
- All 8 Headwind scenarios are separate children of Main.

## B2. Live recovery test on the deployed server

How it was run:
- **Where:** the deployed EC2 server (code from `main`) against live cfo.ai.
- **Data:** a copy of the production database, with its own synthetic cfo.ai scenarios ("Headwind Reviewed/Downside (Recovery test copy)"). The hosted sample and cfo.ai Main were not touched.
- **Trigger:** a simulated client reply on M-103 ("filled through another agency") queued a reassessment.
- **Script:** `deploy/recovery-test.sh`. It stops on any failed step, requires worker 1 to exit 75, and deletes the database copy when it exits. Full log: `eval/results/live-recovery-2026-10-11.log`.

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

# Part C: cfo.ai plan and cost

Checked read-only on 2026-10-11 through the server's cfo.ai session (`inspect_billing` and cfo.ai's own docs). Saved in `eval/results/cfo-plan-and-main-check-2026-10-11.json`.

What Headwind needs from cfo.ai:
- the cfo.ai MCP server (Headwind writes and reads tables through it);
- two extra scenarios per agency;
- no synced data integrations.

| Plan | Verified price | MCP server | Fits Headwind? |
|---|---|---|---|
| Free | $0 | Not listed. Docs: CSV upload is the only data source, with one-time AI credits | **No.** The MCP access Headwind uses isn't included |
| **Startup** | **$500/month,** or $375/month billed annually ($4,500/year) | Yes, plus unlimited Models and Scenarios and 5 standard integrations | **Lowest plan that lists everything Headwind uses** |
| Growth (this workspace, on trial until 2026-10-24) | $1,500/month, or $1,125/month annually ($13,500/year) | Yes, with 4× Startup's AI usage and 8 integrations | Works. Every live run here was on Growth |

- Prices are the workspace's billing readback, not a public price list.
- Paid plans start with a 14-day free trial (cfo.ai docs).

Not verified:
- Headwind has only run on Growth, not on Startup.
- Whether Headwind's MCP writes count against cfo.ai's "AI usage". After all of today's testing, usage shows under 1% of Growth, but Startup's allowance is a quarter of that.
- Whether one cfo.ai plan may serve several agencies.

**What an agency pays in total, if it brings its own cfo.ai account:**

| | Monthly USD | Status |
|---|---|---|
| cfo.ai Startup | 500 (375 if paid annually) | Verified readback price |
| Headwind subscription | 300 | **Hypothesis**, not tested with any agency |
| **Total** | **800 (675 annual)** | Only the cfo.ai part is verified |

- Crustdata credits and model calls are inside Headwind's price; the agency doesn't pay them separately.
- An agency that already has cfo.ai for other reasons would pay only the Headwind part, or more if it's on Growth.

## C2. Headwind's own business plan (hypothesis)

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

Decision: **each agency brings its own cfo.ai account (arrangement A),** so the agency's total is the $800/month in the table above.
- It keeps the agency's finance data in the agency's own workspace.
- It avoids one shared $1,500 plan that leaves only about $270 a month under these guesses.
- It hasn't been confirmed that one cfo.ai plan could legally or technically serve several agencies.

Not validated: price, willingness to pay, adoption, Crustdata's paid credit price and neatlogs pricing.

# Usage this session

- **Crustdata credits:**
  - 6 for the live weekly review.
  - 0 for the replays, recovery test and grading.
  - Earlier balance was 198 credits, expiring Oct 24.
- **Model calls:**
  - 2 in the live weekly review.
  - 40 for the A3 before/after comparison.
  - 1 for the recovery reply.
  - About 35 drafted notes (nova-micro) and 41 judge calls (claude-sonnet-4.6) for A4, plus the earlier grading attempt that didn't save.
- **cfo.ai writes:**
  - 2 live weekly scenario tables and 2 edits.
  - 2 recovery-test tables and 2 edits.
  - 1 business-plan table.
  - 0 to Main.

# Part D: What is still not shown

1. **Model notes miss caveats on hard cases:**
   - 5 of 15 held-out notes passed the independent judge; 18 of 20 replay notes passed.
   - 0 of 5 flagged a stale confirmation.
   - No note made an unsupported outcome claim.
   - A fix (prompt the writer to state staleness and the conflict rule, then regrade) hasn't been tried.
2. **Headwind's check lets hedged claims through:** it missed 2 of 3 misleading-hedge sentences. It passed every real note, but it shouldn't be read as a quality grade.
3. **The judge is one model:**
   - It is stricter than a person might be (the M-103 and H1 failures are borderline).
   - It had 1 false alarm in 6 probe sentences.
   - Nobody else has checked its grades.
4. **The A3 notes weren't stored:** the 20 notes graded in A4 were redrawn from the same inputs, not the original 20.
5. **Live run size:** one complete weekly review and one recovery test, on sample data with simulated replies. There's no repeated live run, no real agency, and no forecast accuracy over time.
6. **First-time roles:**
   - Crustdata gives no past listing history, so a role's first week can only set a starting point.
   - A removal can show up only from the second check onward.
7. **cfo.ai cost:**
   - Startup is the lowest plan whose listed features cover Headwind, but Headwind hasn't run on it.
   - Usage limits on Startup are unverified.
   - Headwind's $300 price, adoption, Crustdata's paid credit price and neatlogs pricing are all unverified.
