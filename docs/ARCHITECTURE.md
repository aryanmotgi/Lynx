# Lynx Architecture

## Mission

Standalone agent-native browser service. Atlas calls Lynx via HTTP with a goal; Lynx drives a real Chromium browser in an isolated microVM and returns the result. Per-company tenancy throughout. No human in the loop.

## High-level flow

```
[Atlas Agent]
    | HTTP POST /v1/dispatch { company_id, goal, ... }
    v
[Lynx Control Plane (Next.js on Vercel)]
    |  - auth (API key)
    |  - tenant guard (company_id)
    |  - budget check (spend_log)
    |  - playbook lookup
    |  - identity injection
    |  - enqueue
    v
[Per-company queue (BullMQ on Upstash Redis)]
    v
[Browser Worker (Vercel Sandbox microVM)]
    |  - launches Patchright Chrome
    |  - loads identity storageState
    |  - runs Stagehand agent loop
    |  - streams actions back via SSE
    v
[Storage]
    - Neon Postgres (RLS): companies, identities, playbooks, runs, actions, spend_log
    - Cloudflare R2: screenshots, rrweb videos
```

## Tenant model

- Every row carries `company_id`.
- Postgres RLS enforces `WHERE company_id = current_setting('lynx.company_id')`.
- Each browser session = its own VM. Zero cookie bleed between companies or even sessions of the same company.

## Components

### apps/control
Next.js. REST API. Auth. Tenant guard. Dispatch. Playbook + identity CRUD.

### apps/worker
Runs inside Vercel Sandbox VM. Boots Patchright Chrome, loads identity, runs Stagehand loop, streams actions, persists final state.

### packages/browser-core
Forked Steel internals. CDP wrapper, session lifecycle, anti-detect glue, rrweb capture.

### packages/agent-loop
Stagehand wrapper. `observe → decide → act` loop. Tier escalation: playbook replay → Haiku + AX tree → Sonnet + vision.

### packages/identity-vault
Per-company identities. Encrypted at rest (AES-256). Stores creds, cookies, `storageState`, fingerprint profile.

### packages/playbook-store
Per-`(company_id, domain)` playbooks. CRUD + versioning. Read before run, append after run. Skill Writer in Atlas mutates via API.

### packages/budget
Logs LLM + infra spend per call. Daily aggregate per company. (No hard cap for now — log only, alert later.)

### packages/shared
Zod schemas, types, common utils.

## Data model (sketch)

```sql
companies (id, name, api_key_hash, created_at)
identities (id, company_id, label, email, phone, payment_token, fingerprint_json, storage_state_url, created_at)
playbooks (id, company_id, domain, version, steps_json, success_rate, updated_at)
runs (id, company_id, identity_id, goal, status, started_at, finished_at, cost_usd, video_url)
actions (id, run_id, idx, type, payload_json, screenshot_url, ts)
spend_log (id, company_id, run_id, kind, amount_usd, ts)
```

All tables have RLS by `company_id`.

## API

```
POST /v1/dispatch
GET  /v1/runs/:id
GET  /v1/runs/:id/stream     # SSE
POST /v1/playbooks
GET  /v1/playbooks
PATCH /v1/playbooks/:id
POST /v1/identities
GET  /v1/identities
GET  /v1/spend/:company_id
```

## Self-improvement loop

1. Run starts → fetch playbook for `(company_id, domain)`.
2. Tier 0: replay playbook steps deterministically.
3. On selector miss → escalate Tier 1 (Haiku + AX tree).
4. On stuck → Tier 2 (Sonnet + vision).
5. On success → append/update playbook (new selectors, success count).
6. Skill Writer (Atlas) periodically rewrites playbooks based on aggregate outcomes.

## No-human-in-loop policy

- Steel's pause-on-error → killed.
- CAPTCHA → 2Captcha auto-solve.
- Stuck → spawn recovery sub-agent (fresh context, same goal).
- Max 3 recovery attempts → fail run, emit event for QC Agent (Atlas).

## Deploy targets

- Control plane: Vercel
- Workers: Vercel Sandbox
- DB: Butterbase REST API (arcus-memory app `app_9kdch2ndsfx9`) — local and production
- Tenancy: enforced in app code by mandatory `company_id` filter on every Butterbase call (service key bypasses RLS by design)
- Queue: Upstash Redis
- Artifacts: Cloudflare R2
- Secrets: Vercel env vars

## Out of scope (lives in Atlas)

- Head Agent
- C-suite agents
- Skill Writer
- QC Agent
- Evaluator
- Planner
