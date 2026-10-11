# Security policy

## Reporting a problem

Please report security problems privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue for them.

Include what you found, how to reproduce it, and what it could expose. This is a one-person project, so there is no promised response time, but every report will be read.

## What's in scope

- The web app and its API routes (`app/`), including sign-in.
- The review worker (`worker/`, `lib/`), including what it sends to Crustdata, the model gateway, cfo.ai and neatlogs.
- The deployment files in `deploy/`.

Out of scope: the Crustdata, cfo.ai, neatlogs and LiteLLM services themselves. Report problems with those to their owners.

## How Headwind handles access and keys

- **Sign-in:** one shared password per server (`HEADWIND_PASSWORD`). The session cookie is an HMAC derived from that password, and it is `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS. Changing the password signs everyone out. After 5 wrong passwords from one address, sign-in from it is locked for 15 minutes.
- **Keys:** API keys live only in environment variables (`.env.local` locally, `/etc/headwind/env` on a server) and are never committed. `.env.example` lists the names with no values.
- **cfo.ai:** the OAuth token is stored in the file set by `CFO_TOKEN_FILE`, outside the repo. Headwind writes only to the Reviewed and Downside scenarios it is bound to, and it reads every write back. It never writes to Main.
- **The model:** it sees evidence summaries and client messages only, never fees, probabilities or expected outcomes. Its notes are checked by code before they are saved.
- **Data:** everything is stored in one SQLite file (`HEADWIND_DB`) on the server. Keep that file and its backups private, because they hold the agency's client and candidate records.

## Known limits

- Headwind has not had a security audit.
- There is one shared password, with no per-user accounts or roles, and one agency per server.
- The live deployment holds sample data only.

If you find a key, token or password committed anywhere in this repository's history, report it the same way, so it can be rotated.
