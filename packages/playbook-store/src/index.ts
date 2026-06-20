import { bbSelect, bbInsert, bbUpdate } from "@lynx/shared";
import type { Playbook, PlaybookStep } from "@lynx/shared";

interface Row {
  company_id: string;
  domain: string;
  version: number;
  steps_json: PlaybookStep[];
  success_rate: number;
}

function toPlaybook(r: Row): Playbook {
  return {
    company_id: r.company_id,
    domain: r.domain,
    version: r.version,
    steps: r.steps_json,
    success_rate: r.success_rate,
  };
}

export async function getPlaybook(company_id: string, domain: string): Promise<Playbook | null> {
  const rows = await bbSelect<Row>(
    "lynx_playbooks",
    { company_id: `eq.${company_id}`, domain: `eq.${domain}` },
    { order: "version.desc", limit: 1 },
  );
  return rows[0] ? toPlaybook(rows[0]) : null;
}

export async function upsertPlaybook(p: Playbook): Promise<Playbook> {
  const existing = await bbSelect<Row>(
    "lynx_playbooks",
    { company_id: `eq.${p.company_id}`, domain: `eq.${p.domain}` },
    { order: "version.desc", limit: 1, select: "version" },
  );
  const nextVersion = existing[0] ? existing[0].version + 1 : 1;
  const inserted = await bbInsert<Row>("lynx_playbooks", {
    company_id: p.company_id,
    domain: p.domain,
    version: nextVersion,
    steps_json: p.steps,
    success_rate: p.success_rate,
  });
  return toPlaybook(inserted);
}

export async function recordOutcome(
  company_id: string,
  domain: string,
  success: boolean,
): Promise<void> {
  const rows = await bbSelect<Row>(
    "lynx_playbooks",
    { company_id: `eq.${company_id}`, domain: `eq.${domain}` },
    { order: "version.desc", limit: 1, select: "version,success_rate" },
  );
  const cur = rows[0];
  if (!cur) return;
  const next = cur.success_rate * 0.9 + (success ? 1 : 0) * 0.1;
  await bbUpdate(
    "lynx_playbooks",
    { company_id: `eq.${company_id}`, domain: `eq.${domain}`, version: `eq.${cur.version}` },
    { success_rate: next, updated_at: new Date().toISOString() },
  );
}

export type { Playbook, PlaybookStep };
