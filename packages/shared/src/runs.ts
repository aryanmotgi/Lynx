import { bbSelect, bbInsert, bbUpdate } from "./butterbase";
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
  return bbInsert<Run>("lynx_runs", {
    company_id: input.company_id,
    identity_id: input.identity_id ?? null,
    goal: input.goal,
    start_url: input.start_url ?? null,
    status: "queued",
  });
}

export async function getRun(company_id: string, id: string): Promise<Run | null> {
  const rows = await bbSelect<Run>(
    "lynx_runs",
    { id: `eq.${id}`, company_id: `eq.${company_id}` },
    { limit: 1 },
  );
  return rows[0] ?? null;
}

export async function updateRunStatus(
  id: string,
  status: RunStatus,
  patch: Partial<Pick<Run, "started_at" | "finished_at" | "cost_usd" | "video_url">> = {},
): Promise<void> {
  const body: Record<string, unknown> = { status };
  if (patch.started_at !== undefined) body.started_at = patch.started_at;
  if (patch.finished_at !== undefined) body.finished_at = patch.finished_at;
  if (patch.cost_usd !== undefined) body.cost_usd = patch.cost_usd;
  if (patch.video_url !== undefined) body.video_url = patch.video_url;
  await bbUpdate("lynx_runs", { id: `eq.${id}` }, body);
}

export async function appendAction(run_id: string, a: Action): Promise<void> {
  await bbInsert("lynx_actions", {
    run_id,
    idx: a.idx,
    type: a.type,
    payload_json: a.payload,
    ts: a.ts,
  });
}

// Atomic claim is best-effort over REST. Production should run with REDIS_URL set
// and use BullMQ for hard ordering. Dev fallback claims one queued run by id
// after an optimistic UPDATE; concurrent workers may race, so dev runs single-worker.
export async function nextQueuedRun(): Promise<Run | null> {
  const queued = await bbSelect<Run>(
    "lynx_runs",
    { status: "eq.queued" },
    { order: "created_at.asc", limit: 1 },
  );
  const candidate = queued[0];
  if (!candidate) return null;
  const updated = await bbUpdate<Run>(
    "lynx_runs",
    { id: `eq.${candidate.id}`, status: "eq.queued" },
    { status: "running", started_at: new Date().toISOString() },
  );
  return updated[0] ?? null;
}
