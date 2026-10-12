import Link from "next/link";
import type { ReactNode } from "react";
import { Callout, CodeBlock, DeploymentReference, ErrorReference } from "./Blocks";

export interface DocSection { id: string; h: string; body: ReactNode }
export interface Doc { slug: string; group: string; title: string; lede: string; sections: DocSection[] }

export const GROUPS = ["Start", "Using Headwind", "Architecture", "Reference", "Security", "Proof", "Help"] as const;

const REPO = "https://github.com/CryptoZephyr/headwind";
const REPORT = `${REPO}/blob/main/eval/REPORT.md`;

export const DOCS: Doc[] = [
  {
    slug: "", group: "Start", title: "What Headwind is",
    lede: "A weekly revenue check for permanent-placement recruitment agencies: which expected placement fees still hold, which need a client to confirm, and what that does to closing cash.",
    sections: [
      { id: "problem", h: "The problem", body: <p>An agency&apos;s cash forecast counts fees from candidates who haven&apos;t started yet. Clients pause hiring, candidates take other offers, and roles go quiet. The forecast is often wrong before anyone notices.</p> },
      { id: "what-it-does", h: "What it does", body: (
        <ul>
          <li>Reads your imported clients, open roles, candidate stages, fees and cash figures.</li>
          <li>Checks each client company and role listing on Crustdata, saving every result with its source and date.</li>
          <li>Decides each role with fixed rules: <em>offer accepted</em>, <em>client confirmed pause</em>, <em>placed elsewhere</em>, or <em>needs confirming</em>.</li>
          <li>Writes one neutral question for each role it can&apos;t settle, with an owner and a due date.</li>
          <li>Keeps three forecast scenarios for the same period and checks two of them in cfo.ai.</li>
        </ul>
      ) },
      { id: "what-it-doesnt", h: "What it doesn't do", body: (
        <>
          <p>It doesn&apos;t treat a missing job listing or a company-wide hiring drop as proof that a role stopped. It doesn&apos;t contact clients for you. It doesn&apos;t touch cfo.ai Main.</p>
          <Callout kind="limit" title="Current scope">One agency per install, one shared team password. Tested on a made-up sample agency and a 40-company Crustdata coverage check, not yet on a real agency&apos;s records.</Callout>
        </>
      ) },
      { id: "next", h: "Where to go next", body: <p>Read <Link href="/docs/start/how-it-works">How it works</Link>, then <Link href="/docs/using-headwind/import">Import your data</Link>. If you just want to see it, try the <Link href="/#sample">sample review</Link>.</p> },
    ],
  },
  {
    slug: "start/how-it-works", group: "Start", title: "How it works",
    lede: "One review a week, one question per unclear role, and a forecast that changes only when evidence supports it.",
    sections: [
      { id: "flow", h: "The weekly flow", body: (
        <ol className="docs-flow">
          <li><strong>Import.</strong> CSV files are checked row by row. Nothing is saved until every row is valid and you press Import.</li>
          <li><strong>Match companies.</strong> Each client domain is looked up on Crustdata. It counts as matched only if exactly one company has that exact domain with high confidence. Otherwise it&apos;s blocked, not guessed.</li>
          <li><strong>Check listings.</strong> For matched companies, Headwind searches for the role&apos;s public listing in a 30-day window.</li>
          <li><strong>Assess.</strong> Fixed rules settle what the evidence supports. For anything unclear, a model writes a short note and a question, and a checker rejects any sentence that claims an outcome the evidence doesn&apos;t show.</li>
          <li><strong>Forecast.</strong> Original, Reviewed and Downside are recalculated.</li>
          <li><strong>Sync to cfo.ai.</strong> Reviewed and Downside are written to their own cfo.ai scenarios and read back. Only a matching readback shows as verified.</li>
        </ol>
      ) },
      { id: "schedule", h: "When it runs", body: <p>A timer queues a weekly review every Monday at 07:00 UTC. You can also start one from the Overview. A pasted client reply queues a shorter reassessment that runs only the assess, forecast and sync steps.</p> },
      { id: "scenarios", h: "The three scenarios", body: (
        <>
          <p><strong>Original</strong> is your imported numbers. <strong>Reviewed</strong> keeps what the evidence supports and removes fees the client or your records have ruled out for this period. <strong>Downside</strong> also leaves out every role still waiting for confirmation.</p>
          <Callout kind="note" title="Not added together">The three are alternatives for the same period and currency. In the sample, Original is $22,000, Reviewed $17,000 and Downside $13,000: a $5,000 client-confirmed pause and $4,000 of unresolved exposure.</Callout>
        </>
      ) },
    ],
  },
  {
    slug: "using-headwind/import", group: "Using Headwind", title: "Import your data",
    lede: "Three required CSV files and one optional one. Rows are checked before anything is saved.",
    sections: [
      { id: "files", h: "The files", body: <p>Clients, Mandates (open roles) and Finance are required. Updates (dated notes about a role) is optional. Column lists are in <Link href="/docs/reference/csv-files">CSV files</Link>, and working templates are in <a href={`${REPO}/tree/main/fixtures/sample`}>fixtures/sample</a>.</p> },
      { id: "steps", h: "Steps", body: (
        <ol>
          <li>Open <strong>Import</strong> after signing in.</li>
          <li>Choose each file, or paste the CSV text into its box.</li>
          <li>Press <strong>Check rows</strong>. Problems are listed by file, row and field. Your text stays in the boxes so you can fix it.</li>
          <li>When every row is valid, press <strong>Import</strong>.</li>
        </ol>
      ) },
      { id: "reimport", h: "Importing again", body: <p>Re-importing updates the same agency (matched by agency name). Roles left out of the new file are marked removed, not deleted. A review that was planned before the import can&apos;t be retried; start a new review instead.</p> },
    ],
  },
  {
    slug: "using-headwind/review", group: "Using Headwind", title: "Run and read a review",
    lede: "Start a review, follow its progress, and read each role's decision and evidence.",
    sections: [
      { id: "start", h: "Start a review", body: <p>On the Overview, press <strong>Run weekly review</strong>. The page shows the current stage, such as &ldquo;Checking role listings&rdquo;, with a step count read from the worker&apos;s saved progress, and refreshes on its own.</p> },
      { id: "overview", h: "Reading the Overview", body: (
        <ul>
          <li><strong>Reviewed closing cash</strong> is the main number, with its difference from Original.</li>
          <li>The <strong>Headwind gap</strong> places Original, Reviewed and Downside on one closing-cash scale.</li>
          <li><strong>This week&apos;s questions</strong> lists one question per unclear role, with who to ask and by when.</li>
          <li><strong>Roles</strong> opens into each role&apos;s evidence, decision history and client replies.</li>
        </ul>
      ) },
      { id: "statuses", h: "Role statuses", body: <p>Statuses are always written in words. <em>Needs confirming</em> is amber, not red: it means the evidence can&apos;t settle the role yet. Red is only used for a confirmed exclusion, such as a candidate placed elsewhere. See <Link href="/docs/reference/outcomes">Outcomes and scenarios</Link>.</p> },
      { id: "evidence", h: "Evidence labels", body: <p>Each item is tagged <em>Live · Crustdata</em>, <em>Agency records</em>, <em>Client reply</em> or <em>Simulated</em>, with its source date. The retrieval date is shown separately.</p> },
    ],
  },
  {
    slug: "using-headwind/replies", group: "Using Headwind", title: "Answer with a client reply",
    lede: "Paste what the client said. Only that role is reassessed, and its history is kept.",
    sections: [
      { id: "paste", h: "Paste a reply", body: (
        <ol>
          <li>In <strong>This week&apos;s questions</strong>, press <strong>Paste client reply</strong> on the role.</li>
          <li>Paste the text and set the date the client replied.</li>
          <li>Tick <strong>simulated</strong> for test data. In the sample agency it starts ticked.</li>
          <li>Press <strong>Save reply</strong>. Headwind reads it, saves it, and queues a reassessment.</li>
        </ol>
      ) },
      { id: "what-changes", h: "What changes", body: <p>A new decision version is added for that role; earlier versions stay visible. If the reply moves money, the Reviewed and Downside scenarios are rewritten and read back. Saving the same reply twice changes nothing.</p> },
      { id: "if-it-fails", h: "If saving fails", body: <p>The sheet keeps your text and shows the reason. Fix it, or try again.</p> },
    ],
  },
  {
    slug: "using-headwind/recovery", group: "Using Headwind", title: "When a review stops",
    lede: "Finished steps are saved. Short failures are retried automatically; longer ones wait for you.",
    sections: [
      { id: "states", h: "Review states", body: (
        <DeploymentReference rows={[
          ["Waiting for the worker", "Queued. The worker picks it up within a few seconds if it's running."],
          ["Running", "A worker holds a 2-minute lease on the review and renews it while working."],
          ["Retrying after an error", "A step failed. The worker checks what was already saved, then tries again, up to 3 attempts."],
          ["Partly done", "Some steps finished, then it stopped (for example, the review's credit budget ran out). Finished steps are kept."],
          ["Stopped", "It couldn't finish. Saved results are kept."],
        ]} />
      ) },
      { id: "retry", h: "Retry unfinished steps", body: <p>On a partly done or stopped review, <strong>Retry unfinished steps</strong> resumes from the step that stopped. It won&apos;t run if another review is in progress, or if the imported data changed since the review was planned.</p> },
      { id: "no-double", h: "No double writes", body: <p>Before resending a cfo.ai write whose answer was lost, Headwind reads cfo.ai first. If the values are already there, it only records the readback.</p> },
    ],
  },
  {
    slug: "architecture/system", group: "Architecture", title: "System overview",
    lede: "A Next.js web app, a background worker and one SQLite database on one server.",
    sections: [
      { id: "parts", h: "The parts", body: (
        <DeploymentReference rows={[
          ["Web app", "Pages, CSV import, reply entry and review controls. Reads the database; queues work but never calls Crustdata or cfo.ai itself."],
          ["Worker", "Claims queued reviews with a lease and runs their steps in order: match companies, check listings, assess, forecast, sync to cfo.ai."],
          ["Database", "SQLite: agency, clients, roles, evidence, cases, decisions, tasks, replies, forecasts and each run's steps."],
          ["Crustdata", <>Company enrichment (<span className="mono">/company/enrich</span>) and role listing search (<span className="mono">/job/search</span>), API version 2025-11-01.</>],
          ["Model gateway", "An OpenAI-compatible model writes case notes and reads client replies. It never sees fees, probabilities or expected totals."],
          ["cfo.ai", "Holds the Reviewed and Downside scenarios. Written and read back over MCP. Main is never written."],
          ["neatlogs", "Receives a trace of each run's steps and model calls."],
        ]} />
      ) },
      { id: "boundaries", h: "Boundaries", body: (
        <Callout kind="boundary" title="What each part owns">The rules in lib/policy.ts decide outcomes; the model only writes notes and reads replies. The forecast maths in lib/scenarios.ts is code, not the model. The worker is the only part that spends Crustdata credits or writes to cfo.ai.</Callout>
      ) },
      { id: "data", h: "What data goes where", body: <p>Client domains and role titles go to Crustdata. Case evidence summaries and reply text go to the model gateway. Scenario totals go to cfo.ai. Run steps and model calls go to neatlogs.</p> },
    ],
  },
  {
    slug: "reference/csv-files", group: "Reference", title: "CSV files",
    lede: "Columns accepted by the importer. Money is whole currency units, probability is a percentage, dates are YYYY-MM-DD.",
    sections: [
      { id: "clients", h: "Clients", body: <CodeBlock label="Columns" code="client_name,domain,account_manager,last_confirmed_date" /> },
      { id: "mandates", h: "Mandates", body: <CodeBlock label="Columns" code="mandate_id,client_domain,role_title,location,agreed_fee,stage,placement_probability,fee_trigger,expected_trigger_date,payment_terms_days,candidate_record,listing_url,listing_seen_date" /> },
      { id: "finance", h: "Finance", body: <><p>Two columns, <span className="mono">key,value</span>, one row per key:</p><CodeBlock label="Keys" code={"agency_name\ncurrency\ncash_date\nhorizon_start\nhorizon_end\nopening_cash\ncollectible_receivables\nrecruiter_pay\nother_expenses"} /></> },
      { id: "updates", h: "Updates (optional)", body: <CodeBlock label="Columns" code="mandate_id,update_date,source,text" /> },
    ],
  },
  {
    slug: "reference/outcomes", group: "Reference", title: "Outcomes and scenarios",
    lede: "What each role status means and how it affects the three scenarios.",
    sections: [
      { id: "outcomes", h: "Outcomes", body: (
        <DeploymentReference rows={[
          ["Offer accepted", "Agency records show an accepted offer. The fee stays in every scenario."],
          ["Client confirmed pause", "The client said the role is paused. The fee date moves to the end of the pause, so the fee leaves Reviewed and Downside if that pushes payment past the period, or if no restart date is given."],
          ["Placed elsewhere", "The role was filled by someone else. The fee leaves Reviewed and Downside."],
          ["Needs confirming", "The evidence can't settle it. The fee stays in Reviewed and is left out of Downside; a question is created."],
        ]} />
      ) },
      { id: "freshness", h: "Freshness", body: <p>A client confirmation older than 10 days before the cash date needs reconfirming. Its age alone never counts as a pause.</p> },
      { id: "maths", h: "Forecast maths", body: <p>Expected fee for a role = agreed fee × the agency&apos;s placement chance. It counts as a receipt only if the payment date (expected fee date + payment terms) falls in the forecast period. Closing cash = opening cash + collectible receivables + counted receipts − recruiter pay − other expenses.</p> },
    ],
  },
  {
    slug: "reference/configuration", group: "Reference", title: "Configuration",
    lede: "Environment variables read by the web app and worker.",
    sections: [
      { id: "env", h: "Environment variables", body: (
        <DeploymentReference rows={[
          ["HEADWIND_PASSWORD", "Shared team password. Required to sign in."],
          ["HEADWIND_DB", "Path to the SQLite file. Default ./data/headwind.db."],
          ["LITELLM_BASE_URL, LiteLLM_API_KEY, HEADWIND_MODEL", "OpenAI-compatible model gateway and model name."],
          ["CRUSTDATA_API_KEY", "Crustdata key for company and listing checks."],
          ["CFO_TOKEN_FILE", "Path to the cfo.ai OAuth token file."],
          ["NEATLOGS_API_KEY, NEATLOGS_ENDPOINT", "Run traces."],
          ["HEADWIND_UPSTREAM", "Vercel only. The app server's URL. When set, this copy serves the public pages and passes /app, /import, /login and /api to that server."],
          ["HEADWIND_PROXY_KEY", "Same secret on Vercel and the app server. The app server trusts the visitor's host and address only from requests carrying it."],
          ["HEADWIND_ASSET_PREFIX", "App server only, set to /_hw for the Vercel setup, so its page files load through the Vercel address."],
        ]} />
      ) },
      { id: "local", h: "Run locally", body: <CodeBlock code={"npm install\ncp .env.example .env.local\nnpx tsx scripts/seed-sample.ts\nnpm run dev\nnpm run worker"} /> },
      { id: "deploy", h: "Deploy", body: <p>The <a href={`${REPO}/tree/main/deploy`}>deploy</a> folder runs the web app, worker, weekly timer and Caddy on one Ubuntu 24.04 server. Keys go in <span className="mono">/etc/headwind/env</span>. For one public address, deploy the same repo to Vercel with HEADWIND_UPSTREAM and HEADWIND_PROXY_KEY set: Vercel serves the landing page and docs, and passes sign-in, the app and the API to the server, where the data and worker stay.</p> },
    ],
  },
  {
    slug: "security/trust", group: "Security", title: "Trust and access",
    lede: "Who can see agency data, who can spend credits or write to cfo.ai, and what is public.",
    sections: [
      { id: "access", h: "Access", body: <p>Everything under <span className="mono">/app</span>, <span className="mono">/import</span> and the API needs the team password. The landing page, the sample walkthrough and these docs are public and read no agency data. Five wrong passwords lock sign-in from that address for 15 minutes.</p> },
      { id: "writes", h: "Who writes where", body: <p>Only the worker calls Crustdata and cfo.ai. Each review has a credit and model-call budget; the run stops when it&apos;s used up. cfo.ai writes go only to the Reviewed and Downside scenarios set up for the agency, never Main.</p> },
      { id: "keys", h: "Keys", body: <p>Keys live in the server&apos;s environment file and the cfo.ai token file, outside the repository. See <a href={`${REPO}/blob/main/SECURITY.md`}>SECURITY.md</a> to report a problem.</p> },
      { id: "privacy", h: "Privacy", body: <Callout kind="limit" title="What isn't protected">There are no per-user accounts or audit log. Candidate and client text sent to the model gateway isn&apos;t anonymised. Using real agency data would need the agency&apos;s permission and a private install.</Callout> },
    ],
  },
  {
    slug: "proof/evidence", group: "Proof", title: "What has been shown",
    lede: "Live runs, controlled tests and their limits. All on sample agency data.",
    sections: [
      { id: "live", h: "Live runs", body: (
        <DeploymentReference rows={[
          ["Full weekly review", <><span className="mono">run_eac5efb75e90428e</span>: 5 of 5 steps, 6 Crustdata credits, both cfo.ai readbacks matched, Main untouched.</>],
          ["Latest code", <><span className="mono">run_903b239b1dad49be</span>: 6 credits, 1 model call, neatlogs trace finalized.</>],
          ["Reply that moves cash", "A simulated \u201con hold until January\u201d reply lowered Reviewed; \u201cback on\u201d restored it. Both readbacks matched."],
          ["Crash mid-run", "The worker resumed from the saved step with 0 duplicate cfo.ai writes."],
        ]} />
      ) },
      { id: "controlled", h: "Controlled tests", body: <p>97 of 97 case notes passed grading by a separate model. Crustdata matched 35 of 40 real client companies across 4 more made-up agencies, with none matched wrongly; only 23 had 6+ months of hiring history. Details: <a href={REPORT}>evaluation report</a>.</p> },
      { id: "limits", h: "What this doesn't prove", body: <Callout kind="limit" title="Not shown yet">Forecast accuracy over time, use by a real agency, or reliability over months. Client replies in these runs were simulated.</Callout> },
    ],
  },
  {
    slug: "help/troubleshooting", group: "Help", title: "Troubleshooting",
    lede: "Real messages Headwind shows, what causes them and how to fix them.",
    sections: [
      { id: "errors", h: "Common problems", body: (
        <ErrorReference rows={[
          { symptom: "\u201cNo password is set for this Headwind install.\u201d", cause: "HEADWIND_PASSWORD is empty.", check: "Look in the server's environment file.", fix: "Set it and restart the web app." },
          { symptom: "\u201cToo many wrong passwords.\u201d", cause: "Five wrong attempts from your address.", check: "Wait for the message to clear.", fix: "Try again after 15 minutes." },
          { symptom: "Review stays on \u201cWaiting for the worker\u201d", cause: "The worker isn't running.", check: "systemctl status headwind-worker on the server, or npm run worker locally.", fix: "Start or restart the worker. The queued review is picked up." },
          { symptom: "\u201cCrustdata budget for this review is used up.\u201d", cause: "The review hit its credit budget.", check: "The Overview shows credits used.", fix: "Finished steps are kept. Retry unfinished steps once you're happy to spend more credits." },
          { symptom: "\u201cThe imported data changed after this review was planned.\u201d", cause: "You imported after the review was queued.", check: "Compare the import time with the review start.", fix: "Start a new review." },
          { symptom: "\u201ccfo.ai sign-in expired and could not be renewed.\u201d", cause: "The cfo.ai token can't be refreshed.", check: "The review shows the sync step stopped.", fix: "Reconnect cfo.ai, then retry unfinished steps. Earlier steps aren't repeated." },
          { symptom: "\u201ccfo.ai isn't set up for this agency yet.\u201d", cause: "No Reviewed/Downside scenarios are linked.", check: "Run the setup script.", fix: "npx tsx scripts/cfo-setup.ts, then retry." },
          { symptom: "Role shows \u201cCompany match: more than one possible company\u201d", cause: "Crustdata returned several companies for that domain.", check: "Open the role's evidence.", fix: "Nothing breaks: the role relies on agency records and client replies. Confirming a match by hand isn't supported yet." },
        ]} />
      ) },
    ],
  },
  {
    slug: "help/faq", group: "Help", title: "FAQ",
    lede: "Short answers to repeated questions.",
    sections: [
      { id: "cost", h: "What does it cost to run?", body: <p>About 6 Crustdata credits per weekly review for the sample agency. cfo.ai&apos;s cheapest plan with the MCP access Headwind uses is Startup at $500 a month. Headwind&apos;s own price is untested.</p> },
      { id: "multi", h: "Can it serve several agencies?", body: <p>Not yet. It runs one agency per install.</p> },
      { id: "listing", h: "Why doesn't a missing listing cut the fee?", body: <p>Listings vanish for many reasons, and Crustdata has no listing history for a role before its first check. A missing listing creates a question instead.</p> },
      { id: "source", h: "Is the code open?", body: <p>Yes, MIT licensed: <a href={REPO}>github.com/CryptoZephyr/headwind</a>.</p> },
    ],
  },
];

export function href(d: Doc): string {
  return d.slug ? `/docs/${d.slug}` : "/docs";
}

export function findDoc(slug: string[] | undefined): Doc | undefined {
  const s = (slug ?? []).join("/");
  return DOCS.find((d) => d.slug === s);
}
