# Lynx deploy — Fly Machines + Butterbase

## Why Fly Machines

Vercel Sandbox not yet confirmed for full Chromium. Fly gives us full Linux
microVMs sized for Chromium and per-machine isolation matching our 1-VM-per-session model.

## Persistence — Butterbase (arcus-memory app)

- App ID: `app_9kdch2ndsfx9`
- API base: `https://api.butterbase.ai/v1/app_9kdch2ndsfx9`
- Lynx-scoped service key minted via `manage_auth_config (generate_service_key, key_scope=app)`. Set as `BUTTERBASE_API_KEY` secret. Never reuse the personal arcus key.

## Tables Lynx owns

- `lynx_companies` — Lynx tenants (Atlas-side companies)
- `lynx_identities` — per-company browser identities (creds, fingerprints, storageState)
- `lynx_playbooks` — per-(company, domain) playbooks (Skill Writer owns)
- `lynx_runs` — every dispatched run
- `lynx_actions` — per-run action log
- `lynx_spend_log` — per-company spend ledger

`memory_entries` is NOT touched by Lynx schema changes. Lynx writes one row
per completed run with `agent="lynx"` so Atlas agents can observe results.

## Apps

- `lynx-control` — Fastify API
- `lynx-worker` — browser-running workers

## Secrets

```
fly secrets set \
  BUTTERBASE_APP_ID=app_9kdch2ndsfx9 \
  BUTTERBASE_API_KEY=bb_sk_... \
  IDENTITY_ENCRYPTION_KEY=... \
  REDIS_URL=... \
  --app lynx-control

fly secrets set \
  BUTTERBASE_APP_ID=app_9kdch2ndsfx9 \
  BUTTERBASE_API_KEY=bb_sk_... \
  IDENTITY_ENCRYPTION_KEY=... \
  REDIS_URL=... \
  --app lynx-worker
```

## Deploy

```
fly launch --copy-config --config fly.control.toml --no-deploy
fly launch --copy-config --config fly.worker.toml  --no-deploy
fly deploy -c fly.control.toml
fly deploy -c fly.worker.toml
```

## Local dev

```
cp .env.example .env
# set BUTTERBASE_API_KEY, IDENTITY_ENCRYPTION_KEY
# All LLM traffic routes through Butterbase AI gateway — no Anthropic key needed.
make seed                  # mints Lynx API key for Test Co
make dev.control
make dev.worker
```

Without `REDIS_URL` the worker polls Butterbase. Single-worker only — concurrent
workers without Redis will race on claim. Set `REDIS_URL` to safely run many workers.
