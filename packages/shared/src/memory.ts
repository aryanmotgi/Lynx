// Bridge to arcus-memory's memory_entries table so Atlas agents can see Lynx runs.

import { bbInsert } from "./butterbase";

export interface MemoryEntry {
  agent: string;
  type: string;
  summary: string;
  outcome: string;
  task_id?: string;
  detail?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export async function writeMemoryEntry(e: MemoryEntry): Promise<void> {
  await bbInsert("memory_entries", {
    agent: e.agent,
    type: e.type,
    summary: e.summary,
    outcome: e.outcome,
    task_id: e.task_id ?? null,
    detail: e.detail ?? null,
    extra: e.extra ?? null,
  });
}
