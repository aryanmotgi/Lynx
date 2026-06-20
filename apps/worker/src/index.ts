// Lynx browser worker.
//
// Two modes:
//   1. REDIS_URL set: BullMQ worker(s), one per active company (subscribed).
//   2. REDIS_URL unset: Postgres polling fallback (SELECT FOR UPDATE SKIP LOCKED).
//
// At deploy time on Fly Machines, one machine per session is the target.

import { db, getRun, nextQueuedRun, startWorker } from "@lynx/shared";
import { runGoal } from "@lynx/agent-loop";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);

async function runOne(run_id: string) {
  // Need company_id; refetch run without RLS scope.
  const r = await db().query(`select * from runs where id = $1`, [run_id]);
  const run = r.rows[0];
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

async function postgresLoop() {
  console.log(`[worker] postgres-poll mode, poll=${POLL_MS}ms`);
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
  // Subscribe to every company on startup. New companies require restart for now.
  const r = await db().query(`select id from companies`);
  for (const row of r.rows) {
    const w = startWorker(row.id, runOne);
    if (w) console.log(`[worker] subscribed to lynx:${row.id}`);
  }
}

async function main() {
  if (process.env.REDIS_URL) await redisLoop();
  else await postgresLoop();
}

main();
