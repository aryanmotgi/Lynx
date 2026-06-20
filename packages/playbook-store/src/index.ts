import { withTenant } from "@lynx/shared";
import type { Playbook, PlaybookStep } from "@lynx/shared";

export async function getPlaybook(company_id: string, domain: string): Promise<Playbook | null> {
  return withTenant(company_id, async (c) => {
    const r = await c.query(
      `select company_id, domain, version, steps_json as steps, success_rate
       from playbooks
       where company_id = $1 and domain = $2
       order by version desc
       limit 1`,
      [company_id, domain],
    );
    return (r.rows[0] as Playbook) ?? null;
  });
}

export async function upsertPlaybook(p: Playbook): Promise<Playbook> {
  return withTenant(p.company_id, async (c) => {
    const existing = await c.query(
      `select version from playbooks where company_id = $1 and domain = $2 order by version desc limit 1`,
      [p.company_id, p.domain],
    );
    const nextVersion = existing.rows[0] ? existing.rows[0].version + 1 : 1;
    const r = await c.query(
      `insert into playbooks (company_id, domain, version, steps_json, success_rate)
       values ($1, $2, $3, $4, $5)
       returning company_id, domain, version, steps_json as steps, success_rate`,
      [p.company_id, p.domain, nextVersion, JSON.stringify(p.steps), p.success_rate],
    );
    return r.rows[0] as Playbook;
  });
}

export async function recordOutcome(
  company_id: string,
  domain: string,
  success: boolean,
): Promise<void> {
  await withTenant(company_id, async (c) => {
    await c.query(
      `update playbooks
       set success_rate = (success_rate * 0.9) + ($3 * 0.1),
           updated_at = now()
       where company_id = $1 and domain = $2`,
      [company_id, domain, success ? 1 : 0],
    );
  });
}

export type { Playbook, PlaybookStep };
