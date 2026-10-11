# Headwind

Weekly revenue check for permanent-placement recruitment agencies: which expected fees still hold, which need confirming, and what that does to cash.

Each week Headwind takes your open mandates and cash figures, checks each client's public hiring data, and gives you three numbers for the month: your original forecast, a reviewed one, and a downside. Anything it can't confirm becomes a question for the account manager, not a guess. When the client answers, only that placement is reassessed and the old decision stays on record.

## What it uses

- **Crustdata** for company hiring counts and job listings. These are company-level signals; they never prove a specific role was paused.
- **cfo.ai** to hold the Reviewed and Downside scenarios. Every write is read back before it counts.
- **LiteLLM** (`nova-micro`) to write case notes and read client replies. Its output is checked against the evidence before it's saved.
- **neatlogs** for traces of each review run.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the keys and HEADWIND_PASSWORD
npx tsx scripts/seed-sample.ts   # optional: labelled sample agency
npm run dev                      # web app on http://localhost:3000 (sign in with HEADWIND_PASSWORD)
npm run worker                   # processes queued reviews
```

`npx tsx scripts/cfo-setup.ts` creates the sample agency's Reviewed and Downside scenarios in cfo.ai (synthetic scenarios, never Main).

## Deploy on one server

`deploy/` runs Headwind on one Ubuntu 24.04 server: the web app and worker as systemd services, a Monday 07:00 UTC timer that queues the weekly review (`npm run weekly`), and Caddy for HTTPS.

1. Copy the repo to `/opt/headwind`, put the same keys as `.env.local` in `/etc/headwind/env` (set `HEADWIND_DB=/var/lib/headwind/headwind.db` and `CFO_TOKEN_FILE=/var/lib/headwind/cfo-token.json`), and `HEADWIND_HOST=<your domain>` in `/etc/headwind/caddy.env`.
2. Run `sudo /opt/headwind/deploy/install.sh`.

After five wrong passwords, sign-in from that address is locked for 15 minutes.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Import files

CSV templates are in `fixtures/sample/`: clients, mandates, finance (key,value) and optional updates. Money is whole USD, probability is a percentage, dates are YYYY-MM-DD. Rows are checked and shown before anything is saved.
