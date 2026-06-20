# Lynx deploy — Fly Machines

## Why Fly Machines, not Vercel Sandbox

Vercel Sandbox is optimized for short-lived code execution. Lynx browser
sessions need full Chromium with several hundred MB of RAM, persistent
storage state, and unrestricted network. Fly Machines give us:

- Full Linux VMs with Chromium support out of the box
- Per-machine isolation matching our 1-VM-per-session model
- Horizontal scale via `fly machines run` per company queue
- Region pinning for identity locality
- Direct SSH for debugging stuck sessions

We can revisit Vercel Sandbox once it adds confirmed Chromium support.

## Apps

- `lynx-control` — Fastify API
- `lynx-worker` — browser-running workers

## Secrets to set per app

```
fly secrets set \
  DATABASE_URL=... \
  REDIS_URL=... \
  IDENTITY_ENCRYPTION_KEY=... \
  ANTHROPIC_API_KEY=... \
  --app lynx-control

fly secrets set \
  DATABASE_URL=... \
  REDIS_URL=... \
  IDENTITY_ENCRYPTION_KEY=... \
  ANTHROPIC_API_KEY=... \
  --app lynx-worker
```

`DATABASE_URL` points at Butterbase Postgres in production.

## Deploy

```
fly launch --copy-config --config fly.control.toml --no-deploy
fly launch --copy-config --config fly.worker.toml --no-deploy
fly deploy -c fly.control.toml
fly deploy -c fly.worker.toml
```

## Butterbase swap

Lynx is Postgres-agnostic; `DATABASE_URL` is the only knob.

1. Provision a Butterbase Postgres database
2. Apply `db/migrations/*.sql` against it (in order)
3. Set `DATABASE_URL` secret on both Fly apps to the Butterbase connection string
4. Seed via `pnpm --filter @lynx/db-scripts seed` once with `DATABASE_URL` pointed at Butterbase

The RLS policies (`lynx.company_id` session var) work identically on Butterbase Postgres.
