# Lynx

Agent-native browser service. Standalone HTTP API. Atlas-ready.

Lynx gives AI agents real Chrome. No API gatekeeping — agents navigate, click, sign up, complete flows on any site like a human.

## What it is

- Standalone HTTP service. Atlas (or any client) calls it via REST.
- Each agent gets an isolated browser session (Firecracker microVM).
- Per-company tenant isolation. Identity vault, playbooks, sessions all scoped.
- Self-improving via playbooks. Skill Writer (external) reads/writes playbook API.
- Autonomous-first: no human in the loop, no pause-for-human fallback.

## Quick start

```bash
pnpm install
pnpm dev
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API

```
POST /v1/dispatch         # run a goal
GET  /v1/runs/:id         # poll result
GET  /v1/runs/:id/stream  # SSE live actions
POST /v1/playbooks        # Skill Writer hook
GET  /v1/identities
```

## Stack

TypeScript, Patchright (stealth Playwright), Stagehand agent loop, Vercel Sandbox workers, Neon Postgres (RLS), Upstash Redis (per-company queues), Cloudflare R2 (artifacts), Claude Sonnet 4.6 + Haiku 4.5.

## Status

Phase 0 — bootstrap.
