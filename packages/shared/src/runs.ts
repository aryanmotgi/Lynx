import { db, withTenant } from "./db";
import type { Action, RunStatus } from "./index";

export interface Run {
  id: string;
  company_id: string;
  identity_id: string | null;
  goal: string;
  status: RunStatus;
  start_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  cost_usd: string;
  video_url: string | null;
  created_at: string;
}

export async function createRun(input: {
  company_id: string;
  identity_id?: string;
  goal: string;
  start_url?: string;
}): Promise<Run> {
  return withTenant(input.company_id, async (c) => {
    const r = await c.query(
      `insert into runs (company_id, identity_id, goal, start_url, status)
       values ($1, $2, $3, $4, 'queued')
       returning *`,
      [input.company_id, input.identity_id ?? null, input.goal, input.start_url ?? null],
    );
    return r.rows[0] as Run;
  });
}

export async function getRun(company_id: string, id: string): Promise<Run | null> {
  return withTenant(company_id, async (c) => {
    const r = await c.query(`select * from runs where id = $1`, [id]);
    return (r.rows[0] as Run) ?? null;
  });
}

export async function updateRunStatus(
  id: string,
  status: RunStatus,
  patch: Partial<Pick<Run, "started_at" | "finished_at" | "cost_usd" | "video_url">> = {},
): Promise<void> {
  // status update runs from worker context which already knows the run; bypass RLS via service role
  await db().query(
    `update runs set status = $2,
       started_at = coalesce($3, started_at),
       finished_at = coalesce($4, finished_at),
       cost_usd = coalesce($5, cost_usd),
       video_url = coalesce($6, video_url)
     where id = $1`,
    [
      id,
      status,
      patch.started_at ?? null,
      patch.finished_at ?? null,
      patch.cost_usd ?? null,
      patch.video_url ?? null,
    ],
  );
}

export async function appendAction(run_id: string, a: Action): Promise<void> {
  await db().query(
    `insert into actions (run_id, idx, type, payload_json, ts)
     values ($1, $2, $3, $4, $5)`,
    [run_id, a.idx, a.type, JSON.stringify(a.payload), a.ts],
  );
}

export async function nextQueuedRun(): Promise<Run | null> {
  // Atomic claim via SKIP LOCKED. Service-role connection, no RLS.
  const c = await db().connect();
  try {
    await c.query("begin");
    const r = await c.query(
      `select * from runs where status = 'queued'
       order by created_at asc
       for update skip locked
       limit 1`,
    );
    const run = r.rows[0] as Run | undefined;
    if (!run) {
      await c.query("commit");
      return null;
    }
    await c.query(
      `update runs set status = 'running', started_at = now() where id = $1`,
      [run.id],
    );
    await c.query("commit");
    return { ...run, status: "running", started_at: new Date().toISOString() };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
