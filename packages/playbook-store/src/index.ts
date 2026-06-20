// playbook-store: per-(company_id, domain) playbooks. CRUD + versioning.
// Skill Writer (external, in Atlas) reads/writes via API.
// TODO Phase 4: Postgres-backed.

import type { Playbook } from "@lynx/shared";

export async function getPlaybook(_company_id: string, _domain: string): Promise<Playbook | null> {
  throw new Error("not implemented — Phase 4");
}

export async function upsertPlaybook(_playbook: Playbook): Promise<void> {
  throw new Error("not implemented — Phase 4");
}
