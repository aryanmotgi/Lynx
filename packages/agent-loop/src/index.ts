// agent-loop: observe → decide → act with tier escalation.
// Tier 0: playbook replay (deterministic, ~$0)
// Tier 1: Haiku + AX tree (~$0.01/action)
// Tier 2: Sonnet 4.6 + vision (~$0.10/action)
//
// PR3 ships the tier router + playbook replayer. Stagehand wiring + real
// Claude SDK calls land in a follow-up commit once Patchright is integrated.

import { getPlaybook, recordOutcome } from "@lynx/playbook-store";
import { appendAction, updateRunStatus } from "@lynx/shared";
import type { Action } from "@lynx/shared";

export type Tier = 0 | 1 | 2;

export interface RunGoal {
  run_id: string;
  company_id: string;
  goal: string;
  start_url?: string;
  identity_id?: string;
}

export interface RunResult {
  status: "succeeded" | "failed";
  cost_usd: number;
  tier_used: Tier;
}

function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function emit(run_id: string, idx: number, type: Action["type"], payload: Record<string, unknown>) {
  await appendAction(run_id, {
    idx,
    type,
    payload,
    ts: new Date().toISOString(),
  });
}

export async function runGoal(g: RunGoal): Promise<RunResult> {
  let idx = 0;
  const domain = domainOf(g.start_url);

  try {
    if (g.start_url) {
      await emit(g.run_id, idx++, "navigate", { url: g.start_url });
    }

    // Tier 0: playbook replay
    if (domain) {
      const pb = await getPlaybook(g.company_id, domain);
      if (pb && pb.success_rate > 0.7) {
        await emit(g.run_id, idx++, "tier_escalate", { tier: 0, reason: "playbook hit" });
        for (const step of pb.steps) {
          await emit(g.run_id, idx++, step.action, {
            selector: step.selector,
            value: step.value,
            note: step.note,
          });
        }
        await recordOutcome(g.company_id, domain, true);
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: "0.0000",
        });
        return { status: "succeeded", cost_usd: 0, tier_used: 0 };
      }
    }

    // Tier 1+2: real agent loop. Stub for PR3 — real impl in next commit.
    await emit(g.run_id, idx++, "tier_escalate", { tier: 1, reason: "no playbook" });
    await emit(g.run_id, idx++, "wait", { note: "agent loop stub — not yet implemented" });

    await updateRunStatus(g.run_id, "failed", {
      finished_at: new Date().toISOString(),
      cost_usd: "0.0000",
    });
    return { status: "failed", cost_usd: 0, tier_used: 1 };
  } catch (e) {
    await emit(g.run_id, idx++, "wait", { error: String(e) });
    await updateRunStatus(g.run_id, "failed", {
      finished_at: new Date().toISOString(),
      cost_usd: "0.0000",
    });
    return { status: "failed", cost_usd: 0, tier_used: 1 };
  }
}
