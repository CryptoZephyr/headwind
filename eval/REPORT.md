# Headwind evaluation report (2026-10-11)

What this covers, in two separate parts:
- **Part A, controlled tests:** the 10 decision cases, what the model is allowed to see, the case-note fix, an independent grade of case notes, and the regrades after the caveat and checker fixes (A5-A7). Inputs are fixed or stubbed.
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

The full suite has **74 of 74 tests passing**: these 10 cases plus 64 tests for recovery, imports, sign-in, calculations and what the model sees.

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

## A5. After the caveat and checker fix (PR #3)

**What changed**
- **Caveats are now written by code, not remembered by the model.** From the client's last confirmation date and the review date, Headwind works out the age (e.g. "41 days before the 2026-10-11 review") and says whether it's past the existing 10-day freshness limit. No new limit was added. Age alone never marks a role paused: a stale confirmation only opens a confirmation task and keeps the role "unknown", which the approved rules already did, so the forecast maths is unchanged.
- **Conflicts are spelled out by code:** both sources, their dates, why one decides the current treatment (or that neither does), and what's still unresolved. These sentences are added to the saved note if the model leaves them out, so they appear on the case page.
- **The client's last confirmation is now saved as evidence** ("Client record: ... last confirmed its open roles on ..."), so a note can cite it. Before, the date was used by the rules but wasn't in the evidence list, so the judge rightly called it unsupported.
- **The hedge check now looks at each part of a sentence separately.** A "not" or "possibly" in one part no longer excuses a claim in another part.
- **Bounded retry and fallback:** the model gets 3 tries. If all 3 fail, the note is built from the evidence itself: what was observed, the required caveats and the agency's own records.
- **Repeated empty listing checks** (found by Devin Review): a second empty search is now recorded as "still no listing since the first check, so no removal can be inferred". Only a listing that was actually seen and then disappears counts as missing.

**Hedge check probes** (written before the run; script `scripts/grade-revised-notes.ts`)

| Sentence | Really unsupported? | Check flags it (before → after) | Judge flags it |
|---|---|---|---|
| "The role was paused, not cancelled." | yes | no → **yes** | yes |
| "The role is no longer open and the client could not confirm a new date." | yes | no → **yes** | yes |
| "Hiring is frozen company-wide, which confirms this role is on hold." | yes | yes → yes | yes |
| "The role was possibly delayed; it was cancelled last week." | yes | new → yes | yes |
| "Unconfirmed reports aside, the role is filled." | yes | new → yes | yes |
| "The listing was not found; this is an observation, not proof of a pause." | no | no | no |
| "It is unclear whether the role is still open." | no | no | no |
| "The client may have filled the role elsewhere, so we should confirm." | no | no | no |
| "There is no evidence, so far, that the role was cancelled." | no | **yes (false alarm)** | no |

- The check now catches **5 of 5** unsupported sentences, up from 1 of 3.
- It wrongly flags **1 of 4** cautious sentences. That false alarm is real: it makes the model retry, and in H1 all 5 notes fell back to the evidence-built note.
- The same sentences also run as unit tests in `tests/llm.test.ts`.

**Independent regrade** (judge: Claude Sonnet 4.6, writer: nova-micro, both at temperature 0; artifact `eval/results/revised-note-grading-2026-10-11T10-58-18-099Z.json`)

Each saved row has the note, the rejected drafts and why they were rejected, the input evidence, the rule result and required caveats, the writer and judge models and settings, the rubric, the judge's reason and the neatlogs trace ID (65 of 67 rows; the 2 notes written fully by code have no model call).

Groups, labelled in the artifact:
- **Redrawn originals (new group):** M-102 and M-103 redrawn with the revised writer. These are not the original 20 notes, whose text was never saved.
- **H1-H3:** the old held-out cases. They shaped this fix, so they are no longer held out.
- **F1-F5:** fresh in the first post-fix run (17 of 21 passed there). That run found the missing confirmation evidence, so they shaped the second change and are no longer held out either.
- **G1-G3:** written after the last change to the rules and never used to tune them. This is the only truly fresh group.

Unsupported claims and caveat completeness are counted separately:

| Group | Notes | Unsupported outcome claim (judge) | Company data used as role proof | Caveats complete (judge) | Required caveats present (code check) | Passed all |
|---|---|---|---|---|---|---|
| Redrawn originals | 20 | 2 / 20 | 0 / 20 | 19 / 20 | 20 / 20 | 18 / 20 |
| H1-H3 (shaped the fix) | 11 | 0 / 11 | 0 / 11 | 11 / 11 | 11 / 11 | 11 / 11 |
| F1-F5 (shaped the fix) | 21 | 1 / 21 | 0 / 21 | 16 / 21 | 21 / 21 | 15 / 21 |
| **G1-G3 (fresh)** | **15** | **1 / 15** | **0 / 15** | **9 / 15** | **15 / 15** | **8 / 15** |
| All | 67 | 4 / 67 | 0 / 67 | 55 / 67 | 67 / 67 | 52 / 67 |

- Every note cited only real evidence IDs (67 of 67).
- On the fresh cases: G1 (client quote "not cancelled, just slower") 5 of 5, G2 (fresh confirmation vs company decline and missing listing) 3 of 5, G3 (stale confirmation plus an unclear client reply) **0 of 5**.
- An earlier run on the same G cases, before a logging-only change, gave 7 of 15. Results move by a note or two between runs.

**Manual inspection of the tricky examples**
- **All 4 "unsupported" flags are in the question, not the summary.** Three ask the client "has the role been paused, cancelled or filled?" and one asks "has there been any update?". I read none of them as asserting an outcome, but the first three do put outcomes in front of the client that no evidence suggests. Headwind's check doesn't read questions.
- **G3 fails for a real reason:** the rules already list "the reply didn't say whether the role is still active" as an open question, but it isn't one of the code-written caveats, and the model never mentions the reply.
- **F1 fails for a real reason too:** the recruiter's "probably slowing down, nothing decided yet" never appears in the notes. The model drops agency remarks that aren't turned into code-written caveats.
- **Stale confirmation with a live listing (H3, F3, G3):** every note gave the age and said it needs reconfirming without calling the role paused.
- **Fresh confirmation vs company decline (G2, F5):** the code-written sentence names both sources and dates and says why the role's own confirmation decides. The 2 G2 failures are a hedged question and a missed "the missing listing is only an observation".
- **Fallback notes (H1):** all 5 were readable and passed, but several drafts were rejected only because of the check's false alarm above.
- **Repeated text:** when the model already paraphrases a caveat, the code still adds the exact sentence, so some notes say the same thing twice.

## A6. After Devin Review's three findings (PR #3, second round)

**What changed**
- **"Evidence", "proof" and "observation" no longer count as hedge words.** Before, "The evidence shows the role was cancelled." passed the check. Only real negations and uncertainty words ("no evidence", "not", "unclear whether", "may") now soften a claim.
- **A hedge now covers a list it governs.** "It is unclear whether the role was paused, cancelled or filled." used to fail on "cancelled or filled", because the check split at every comma; it now passes. A comma-separated part still counts as a separate claim when it has its own verb ("..., the role was cancelled") and isn't a "that/whether/if" continuation, and "but", "and", ";" and similar still start a new claim. "So far" no longer counts as "so", which caused the false alarm on "There is no evidence, so far, that the role was cancelled."
- **First listing sighting:** when a role's first check finds a listing, the note now says Crustdata "currently lists a matching public role (first check, no earlier sighting)", not "still lists".

**Hedge check probes** (the 9 above plus 3 new ones)

| Sentence | Really unsupported? | Check flags it | Judge flags it |
|---|---|---|---|
| The 5 unsupported sentences from A5 | yes | 5 / 5 | 5 / 5 |
| "The evidence shows the role was cancelled." (new) | yes | yes | yes |
| "It is unclear whether the role was paused, but it was cancelled last week." (new) | yes | yes | yes |
| The 3 cautious sentences from A5 | no | 0 / 3 | 0 / 3 |
| "There is no evidence, so far, that the role was cancelled." | no | **no** (was a false alarm) | no |
| "It is unclear whether the role was paused, cancelled or filled." (new) | no | no | no |

- The check flags **7 of 7** unsupported sentences and **0 of 5** cautious ones. These are hand-written probes, not a measure of every possible sentence.

**Independent regrade** (same judge, writer, rubric, cases and cohort labels as A5; artifact `eval/results/revised-note-grading-2026-10-11T11-41-49-770Z.json`; 65 of 67 rows have a neatlogs trace ID)

| Group | Notes | Unsupported outcome claim (judge) | Company data used as role proof | Caveats complete (judge) | Required caveats present (code check) | Passed all |
|---|---|---|---|---|---|---|
| Redrawn originals | 20 | 2 / 20 | 1 / 20 | 18 / 20 | 20 / 20 | 17 / 20 |
| H1-H3 (shaped the fix) | 11 | 0 / 11 | 2 / 11 | 9 / 11 | 11 / 11 | 7 / 11 |
| F1-F5 (shaped the fix) | 21 | 0 / 21 | 0 / 21 | 16 / 21 | 21 / 21 | 16 / 21 |
| **G1-G3 (fresh)** | **15** | **0 / 15** | **0 / 15** | **9 / 15** | **15 / 15** | **9 / 15** |
| All | 67 | 2 / 67 | 3 / 67 | 52 / 67 | 67 / 67 | 49 / 67 |

- Every note cited only real evidence IDs (67 of 67).
- **Fallbacks dropped from 5 to 0:** with the false alarm gone, every H1 note was written by the model. The writer used 73 calls for 65 model notes.
- **By case:** M-102 10 of 10, M-103 7 of 10, H1 1 of 5, H2 1 of 1, H3 5 of 5, F1 0 of 5, F2-F4 15 of 15, F5 1 of 1, G1 5 of 5, G2 4 of 5, G3 0 of 5.
- **Don't read the totals as better or worse than A5.** Fewer unsupported claims (2 vs 4) but more company-data flags (3 vs 0), and 49 vs 52 passed overall. Most of the change is H1, where the fallback notes were replaced by model notes.

**Manual inspection of the new flags**
- **M-103, 2 unsupported plus 1 company-data flag:** in 3 of 10 notes the model wrote that the missing listing was "indicating it may no longer be active". The check lets this through because "may" hedges it, but the judge reads it as treating a missing listing as evidence about the role. I agree with the judge: the hedge doesn't change that the inference rests only on a missing listing. One of these notes also asks whether the role has been "paused, cancelled, or filled".
- **H1, 2 company-data flags:** both point at the code-written conflict sentence ("Conflicting evidence: ... company-wide open roles fell from 30 to 14 ..., and the client's last confirmation ... Neither settles this role"). That sentence is the one A5 added to name both sources, and it says the company count doesn't settle the role. The judge objects to putting the two side by side at all. I read this as the judge being strict, not as the note using company data as proof. In A5 the same sentence wasn't flagged in the H1 fallback notes, so this judge is not consistent on it.
- **Still missing (unchanged):** G3 (unclear client reply) 0 of 5, F1 (informal "probably slowing down") 0 of 5, and 2 of 5 H1 notes don't mention HR's "could not say".

## A7. Mandatory caveats for replies, remarks and missing listings; question check (PR #3, third round)

**What changed**
- **More caveats are now written by code from saved evidence, not left to the model:**
  - **Unclear client reply:** "The client's reply on <date> doesn't say whether this role is still active, so it stays unconfirmed."
  - **Recruiter remarks** (saved `agency_update` evidence): "Reported remark (<date>), repeated as said and not a dated client confirmation of this role's status: <text>". These are added only when the case is unresolved, so a recent confirmation isn't cluttered with them.
  - **Listing gone after a sighting:** "Crustdata on <date> found no matching public listing after an earlier sighting. A missing listing is an observation only; it doesn't show this role is paused, cancelled or filled."
  - **Conflict sentences** now say outright that the company-wide count "is not evidence about this one".
  - None of these change the forecast treatment. They only add text.
- **The hedge check:**
  - A guess drawn from a missing listing ("indicating it may no longer be active") is now flagged even with "may" in it. Negated forms ("does not indicate", "never prove, indicate, or suggest") still pass.
  - A comma part with no verb no longer inherits an earlier hedge just because it has no verb. "The role may be paused, definitely cancelled." is flagged. A real list ("unclear whether the role was paused, cancelled or filled") still passes.
  - "Insufficient evidence", "inconclusive", "unproven" and "lacking" count as cautious. "The evidence shows..." still doesn't.
- **Questions to the client are checked too.** If a question names an outcome (paused, cancelled, filled...) that no agency record mentions, it's rejected and the model tries again, within the same 3-attempt limit.
- The writer's summary limit went from 600 to 1,200 characters and from 400 to 700 output tokens. Longer notes with the new caveats were being cut off and rejected as "missing fields".
- **Two prompt lines were reworded.** The model was copying the prompt word for word ("never prove, indicate or suggest..."), and that tripped the check.

**How the fix was tuned (so you can judge how fresh the cases are)**
- `revised-note-grading-2026-10-11T11-53-33-967Z.json` (first run): G2 fell back to the code-written note 5 of 5 times and failed every time. The cause was that nothing said the missing listing was only an observation. That run led to the listing caveat.
- `...11-59-01-664Z.json`: 66 of 67 passed, but 15 notes fell back. The model was copying the new prompt line, and the check flagged it. G1 failed once on the old remark wording. That run led to the prompt rewording, the remark wording and the "or indicate" fix.
- So G1-G3 shaped this round and are no longer fresh. **K1-K3 are new cases**, written after every change above and not used for any tuning.
- `...12-04-23-253Z.json` was a check run of the same code before K1-K3 were added: 67 of 67 passed, with 0 fallbacks.

**Hedge check probes** (17 hand-written sentences: 9 unsupported, 8 cautious)

| Sentence | Really unsupported? | Check flags it | Judge flags it |
|---|---|---|---|
| The 7 unsupported sentences from A6 | yes | 7 / 7 | 7 / 7 |
| "The listing was not found in the latest complete check, indicating it may no longer be active." (new) | yes | yes | yes |
| "The role may be paused, definitely cancelled." (new) | yes | yes | yes |
| The 5 cautious sentences from A6 | no | 0 / 5 | 0 / 5 |
| "The missing listing does not indicate that the role was cancelled." (new) | no | no | no |
| "There is insufficient evidence that the role was cancelled." (new) | no | no | no |
| "These observations never prove, indicate, or suggest that the role was paused." (new) | no | no | no |

- The check flags **9 of 9** unsupported sentences and **0 of 8** cautious ones, and the judge agrees on all 17. These are hand-written probes, not a measure of every possible sentence. 88 unit tests cover these and the question check.

**Independent regrade** (same judge, rubric and labels; artifact `eval/results/revised-note-grading-2026-10-11T12-10-15-072Z.json`; 80 of 82 rows have a neatlogs trace ID; the other 2 are code-only notes with no model call)

| Group | Notes | Unsupported outcome claim (judge) | Company data used as role proof | Caveats complete (judge) | Required caveats present (code check) | Passed all |
|---|---|---|---|---|---|---|
| Redrawn originals | 20 | 0 / 20 | 0 / 20 | 20 / 20 | 20 / 20 | 20 / 20 |
| H1-H3 (shaped earlier fixes) | 11 | 0 / 11 | 0 / 11 | 11 / 11 | 11 / 11 | 11 / 11 |
| F1-F5 (shaped earlier fixes) | 21 | 1 / 21 | 0 / 21 | 21 / 21 | 21 / 21 | 20 / 21 |
| G1-G3 (shaped this fix) | 15 | 0 / 15 | 0 / 15 | 15 / 15 | 15 / 15 | 15 / 15 |
| **K1-K3 (fresh)** | **15** | **0 / 15** | **1 / 15** | **15 / 15** | **15 / 15** | **14 / 15** |
| All | 82 | 1 / 82 | 1 / 82 | 82 / 82 | 82 / 82 | 80 / 82 |

- Every note cited only real evidence IDs (82 of 82). **No note fell back to the code-written text** (0 of 82). The writer used 81 calls for 80 model notes, and one draft was rejected and redone.
- **By case:** M-102 10 of 10, M-103 10 of 10, H1 5 of 5, H2 1 of 1, H3 5 of 5, F1 5 of 5, F2 4 of 5, F3-F5 11 of 11, G1-G3 15 of 15, K1 4 of 5, K2 5 of 5, K3 5 of 5.
- **Old gaps now closed:** G3 (unclear client reply) went from 0 of 5 to 5 of 5. F1 (informal "probably slowing down") went from 0 of 5 to 5 of 5. "May no longer be active" now appears in 0 of 20 M-103/M-102 notes, down from 3 in A6. That's because the sentences are now written by code, not because the model got better at this.

**Manual inspection of the 2 failures and the tricky cases**
- **F2 #3, judged an unsupported claim:** the note says "it is unclear whether the role is still open or if it has been paused or filled". The same judge passed the almost identical probe "It is unclear whether the role was paused, cancelled or filled." I read the note as cautious and the judge as inconsistent. The check also passes it, on purpose.
- **K1 #3, judged as company data used as role proof:** the note disclaims the company count, then says "no public listing for the role has been found since 2026-09-11" without saying that proves nothing. The judge reads that as using the listing. I think it's borderline: the note never draws a conclusion from it. Still, the never-seen-listing state (`still_absent`) has no code-written "this proves nothing" sentence, unlike `not_found`.
- **K1 (rumour of an internal move):** in 5 of 5 notes the remark is reported as "nothing agreed" and none says the role is filled. **K2:** all 5 have the reply and listing caveats. **K3:** all 5 say there's no confirmation on record and that the first sighting doesn't confirm the mandate.
- **Questions:** all 82 saved questions ask neutrally about the role's status. None lists possible outcomes.

**Remaining limits (evidence quality)**
- **Notes repeat themselves.** The model often restates a code-written caveat in its own words, and the code then appends the exact sentence. In K2 the confirmation sentence appears twice. Correctness isn't affected, but the notes are longer than they need to be.
- **The judge isn't fully consistent** on "unclear whether ... paused or filled" (see F2) and on mentioning a missing listing at all (K1). Its verdicts are one model's reading, not ground truth.
- **K1-K3 are 3 hand-written cases, 5 notes each.** That's evidence the fix generalises to new cases of these kinds, not a measure of real agency traffic.
- **The checks are pattern-based.** They match the outcome words we listed (paused, cancelled, filled, frozen, on hold, closed, withdrawn and similar). A claim phrased in words outside that list ("the client has moved on") wouldn't be caught by code. Only the judge would catch it.
- **Every case uses Nova Micro at temperature 0.** Another writer model hasn't been regraded.

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

1. **Some caveats still depend on the model:** only confirmation age and conflicting sources are written by code. An unclear client reply (G3, 0 of 5) and informal agency remarks (F1, 0 of 5) are often left out. On the only truly fresh cases, 9 of 15 notes had every caveat the judge expected.
2. **Questions aren't checked:** in A5, 4 of 67 notes asked the client about outcomes nothing pointed to; in A6 the judge raised this in 1 note. No summary made an unsupported claim on my reading.
3. **The hedge check is a word pattern.** It now flags 7 of 7 unsupported probe sentences and 0 of 5 cautious ones, but those are hand-written probes. It accepts hedged inferences from a missing listing ("may no longer be active"), which the judge flagged in 3 of 67 notes, and it doesn't read questions.
4. **Small, partly reused test set:** H1-H3 and F1-F5 both shaped the fix, so only the 3 G cases (15 notes) are untouched, and scores move by a note or two between runs.
5. **The judge is one model:** nobody else has checked its grades, and some of its failures (F5 in round 1, part of G2) are about wording more than meaning.
6. **The A3 notes weren't stored:** the A4 and A5 originals were redrawn from the same inputs, not the original 20.
7. **Live run size:** one complete weekly review and one recovery test, on sample data with simulated replies. The fix in A5 hasn't been run live or deployed yet. There's no repeated live run, no real agency, and no forecast accuracy over time.
8. **First-time roles:** Crustdata gives no past listing history, so a role's first check only sets a starting point. A removal can show up only after a listing has actually been seen.
9. **cfo.ai cost:**
   - Startup is the lowest plan whose listed features cover Headwind, but Headwind hasn't run on it.
   - Usage limits on Startup are unverified.
   - Headwind's $300 price, adoption, Crustdata's paid credit price and neatlogs pricing are all unverified.
