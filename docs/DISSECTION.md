# Steel Browser Dissection

Phase 1 deliverable. Filled in after cloning `steel-dev/steel-browser` into `vendor/steel-reference/`.

## Goals

- Map Steel's architecture: control API, browser worker, session lifecycle, anti-detect plugins.
- Identify what to keep, fork into `packages/browser-core`, and what to cut.
- Document weak spots Lynx improves: tenant isolation, no-human-in-loop, playbooks, identity vault.

## Sections (TODO)

- [ ] Repo layout
- [ ] Control API surface
- [ ] CDP wrapper pattern
- [ ] Session lifecycle (create / persist / destroy)
- [ ] Anti-detect / stealth approach
- [ ] Extension points
- [ ] What to keep
- [ ] What to cut
- [ ] What to add (Lynx delta)
