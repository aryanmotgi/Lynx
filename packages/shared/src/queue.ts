// Per-company BullMQ queues over Upstash/standard Redis. Falls back to
// Postgres polling (nextQueuedRun) when REDIS_URL is unset (local dev).

import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import IORedis from "ioredis";

let _connection: ConnectionOptions | null = null;
const queues = new Map<string, Queue>();

function connection(): ConnectionOptions | null {
  if (_connection !== null) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  _connection = new IORedis(url, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
  return _connection;
}

export function queueFor(company_id: string): Queue | null {
  const conn = connection();
  if (!conn) return null;
  const name = `lynx:${company_id}`;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: conn });
    queues.set(name, q);
  }
  return q;
}

export async function enqueueRun(company_id: string, run_id: string): Promise<void> {
  const q = queueFor(company_id);
  if (!q) return; // Postgres polling will pick it up
  await q.add("run", { run_id, company_id }, { jobId: run_id, removeOnComplete: true });
}

export function startWorker(
  company_id: string,
  handler: (run_id: string) => Promise<void>,
): Worker | null {
  const conn = connection();
  if (!conn) return null;
  return new Worker(
    `lynx:${company_id}`,
    async (job: Job) => handler(job.data.run_id as string),
    { connection: conn, concurrency: 5 },
  );
}
