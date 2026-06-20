// Lynx browser worker. Polls Postgres queue (no Redis dep yet), claims one
// run at a time via SELECT ... FOR UPDATE SKIP LOCKED, drives the agent loop.
//
// At deploy time this process runs inside a Vercel Sandbox microVM, one VM
// per session. Locally it's a single long-running process.

import { nextQueuedRun, getRun } from "@lynx/shared";
import { runGoal } from "@lynx/agent-loop";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);

async function tick() {
  const run = await nextQueuedRun();
  if (!run) return;
  console.log(`[worker] claimed run ${run.id} for company ${run.company_id}`);
  // start_url is not yet stored on run rows; PR3 follow-up adds it. For now
  // worker pulls latest action-zero hint or skips. Pass null for stub.
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

async function loop() {
  console.log(`[worker] starting, poll=${POLL_MS}ms`);
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("[worker] tick error:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
