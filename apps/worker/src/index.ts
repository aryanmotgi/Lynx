// Lynx browser worker.
// REDIS_URL set: BullMQ. Unset: Butterbase REST polling fallback.

import { bbSelect, getRun, nextQueuedRun, startWorker } from "@lynx/shared";
import { runGoal } from "@lynx/agent-loop";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);

interface RunRow {
  id: string;
  company_id: string;
  goal: string;
  start_url: string | null;
  identity_id: string | null;
}

async function runOne(run_id: string) {
  const rows = await bbSelect<RunRow>(
    "lynx_runs",
    { id: `eq.${run_id}` },
    { limit: 1, select: "id,company_id,goal,start_url,identity_id" },
  );
  const run = rows[0];
  if (!run) return;
  console.log(`[worker] claimed run ${run.id} for company ${run.company_id}`);
  await runGoal({
    run_id: run.id,
    company_id: run.company_id,
    goal: run.goal,
    start_url: run.start_url ?? undefined,
    identity_id: run.identity_id ?? undefined,
  });
  const final = await getRun(run.company_id, run.id);
  console.log(`[worker] finished ${run.id} → ${final?.status}`);
}

async function butterbaseLoop() {
  console.log(`[worker] butterbase-poll mode, poll=${POLL_MS}ms`);
  for (;;) {
    try {
      const run = await nextQueuedRun();
      if (run) await runOne(run.id);
    } catch (e) {
      console.error("[worker] tick error:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function redisLoop() {
  console.log("[worker] redis/BullMQ mode");
  const companies = await bbSelect<{ id: string }>("lynx_companies", {}, { select: "id" });
  for (const co of companies) {
    const w = startWorker(co.id, runOne);
    if (w) console.log(`[worker] subscribed to lynx:${co.id}`);
  }
}

async function main() {
  if (process.env.REDIS_URL) await redisLoop();
  else await butterbaseLoop();
}

main();
