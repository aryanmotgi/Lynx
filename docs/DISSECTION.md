# Steel Browser Dissection

Source: `vendor/steel-reference/` (steel-dev/steel-browser @ main, shallow clone).

## Repo layout

```
api/                Fastify HTTP server + browser orchestration
  src/
    index.ts                  bootstrap
    routes.ts                 route registration
    env.ts, config.ts         env + config
    modules/                  HTTP modules
      sessions/                 sessions controller/routes/schema
      cdp/                      CDP passthrough
      actions/                  high-level actions API
      files/                    file storage
      logs/                     request log API
      selenium/                 selenium compat
    services/                 core domain services
      session.service.ts          session lifecycle
      cdp/cdp.service.ts          1533-line CDPService — Chrome via Puppeteer + CDP
      cdp/plugins/                CDPService plugins (extensible hooks)
      context/                    cookies, storage, fingerprint context
      file.service.ts, leveldb/   artifact + KV persistence
      selenium.service.ts         selenium server
      timezone-fetcher.service.ts geo→tz lookup
      websocket-registry.service.ts  CDP WS pool
    plugins/                  Fastify plugins
      browser.ts, browser-session.ts, selenium.ts
      file-storage.ts, request-logger.ts, ui-plugin.ts
    templates/                preset browser configs
ui/                 React debug viewer (live session view)
repl/               REPL for poking the API
docker-compose.yml, Dockerfile, render.yaml
```

## Key services

### CDPService (`services/cdp/cdp.service.ts`)
- Wraps Puppeteer + raw CDP.
- Launches Chromium child process, manages lifetime.
- Exposes CDP WS endpoint per session.
- Plugin system (`plugins/core/base-plugin.ts`) lets behaviors hook lifecycle: launch, navigate, shutdown.
- **This is the keeper.** Lynx `packages/browser-core` will port a slimmed version.

### SessionService (`services/session.service.ts`)
- One active session at a time per process (Steel runs one browser per container).
- Holds `pastSessions` + `activeSession` with completion promises.
- Defaults: 1920x1080, captcha off, proxy off.
- Wraps CDPService + SeleniumService + FileService + TimezoneFetcher.
- **Lynx pivot**: kill single-active-session model. Each Vercel Sandbox VM = one session. SessionService becomes a thin wrapper around CDPService; concurrency is at the orchestration layer (BullMQ), not the service layer.

### Context (`services/context/`)
- Cookie + storageState marshalling.
- Fingerprint injection (`fingerprint-generator`).
- **Keeper**, port to `packages/browser-core/context`.

### LevelDB (`services/leveldb/`)
- Local KV for session state.
- **Cut.** Lynx uses Postgres (canonical) + R2 (artifacts).

### FileService (`services/file.service.ts`)
- Per-session artifact dir on disk.
- **Replace** with R2-backed adapter in Lynx.

### SeleniumService
- Selenium compat shim.
- **Cut.** Lynx is Stagehand + Patchright only.

### UI plugin (`plugins/ui-plugin.ts`)
- Serves React debug viewer at `/`.
- **Cut.** No humans in Lynx. Maybe revisit for ops dashboard later.

## API surface (Steel)

From `api/src/modules/sessions/sessions.routes.ts` and `routes.ts`:

- `POST /v1/sessions` create
- `GET  /v1/sessions/:id` details
- `POST /v1/sessions/:id/release` end
- `GET  /v1/sessions/debug` debug viewer
- `/v1/cdp/*` CDP passthrough
- `/v1/actions/*` high-level actions (goto, screenshot, scrape)
- `/v1/files/*` artifacts
- `/v1/logs/*` request logs

## Data flow

```
HTTP POST /v1/sessions
  → SessionController
    → SessionService.create()
      → CDPService.launch()           spawns Chrome
      → ProxyServer (optional)
      → fingerprint inject
      → TimezoneFetcher (geo→tz)
      → returns SessionDetails {id, websocketUrl, debugUrl}
Client → connects via Puppeteer/Playwright using websocketUrl
  → CDP commands flow through CDPService passthrough
On release:
  → CDPService.shutdown()
  → FileService.persist() (artifacts → disk)
  → SessionService.activeSession → pastSessions
```

## Anti-detect

- `fingerprint-generator` npm package for header + JS fingerprint values
- Puppeteer stealth via plugins under `services/cdp/plugins/core/`
- Proxy chain in `utils/proxy.ts`
- **Lynx upgrade**: swap to Patchright (Playwright stealth fork). Per-identity fingerprint stored in `identities.fingerprint_json`, not regenerated per session.

## What to keep (port to `packages/browser-core`)

1. CDPService core (launch, navigate, CDP passthrough) — slim from 1533 → ~500 lines, drop Steel-specific telemetry
2. Plugin hook system (`base-plugin.ts`) — clean extension point
3. Context module (cookies, storageState, fingerprint inject)
4. Proxy utilities (`utils/proxy.ts`)
5. Retry, errors, schema utilities

## What to cut

1. SeleniumService + module — dead weight
2. LevelDB — replaced by Postgres
3. UI plugin + React app — autonomous, no human viewer
4. FileService disk persistence — replaced by R2 adapter
5. Single-active-session model in SessionService
6. Telemetry to Steel cloud

## What to add (Lynx delta)

1. **Tenant guard middleware**: every request requires `company_id` (from API key), sets `lynx.company_id` Postgres session var for RLS
2. **Identity injection**: load `storageState` from R2 by `identity_id` before launch
3. **Playbook hook**: pre-run fetch, post-run upsert
4. **Stagehand integration**: drives the session via agent loop, not user CDP
5. **Auto-recovery**: spawn fresh CDPService instance on stuck state (no human pause)
6. **CAPTCHA router**: detect → 2Captcha → resume
7. **rrweb recorder**: full DOM video for audit
8. **Action log emitter**: every CDP-derived action → Postgres `actions` row
9. **Per-VM sandboxing**: each session in own Vercel Sandbox microVM
10. **BullMQ worker**: pull job → boot CDPService → run agent loop → report

## Migration plan into Lynx packages

| Steel | Lynx |
|-------|------|
| `services/cdp/*` | `packages/browser-core/src/cdp/` |
| `services/context/*` | `packages/browser-core/src/context/` |
| `utils/proxy.ts`, `utils/retry.ts`, `utils/errors.ts` | `packages/browser-core/src/utils/` |
| `services/session.service.ts` | rewritten in `packages/browser-core/src/session.ts` (1 session per process) |
| `services/file.service.ts` | replaced by `packages/shared/src/r2.ts` |
| `plugins/browser.ts` etc | Lynx Next.js route handlers in `apps/control` |
| `services/selenium.service.ts` | dropped |
| `services/leveldb/*` | dropped |
| `ui/` | dropped |
