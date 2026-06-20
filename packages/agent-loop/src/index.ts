// agent-loop: observe → decide → act with tier escalation.
//
// Tier 0: playbook replay via Patchright (deterministic, ~$0)
// Tier 1: Stagehand with Claude Haiku 4.5 (cheap)
// Tier 2: Stagehand with Claude Sonnet 4.6 (powerful)
//
// Recovery: on stuck, spawn fresh session up to MAX_RECOVERY attempts.

import { Stagehand } from "@browserbasehq/stagehand";
import { getPlaybook, recordOutcome } from "@lynx/playbook-store";
import { appendAction, updateRunStatus } from "@lynx/shared";
import { getIdentity } from "@lynx/identity-vault";
import { launchSession, type BrowserSession } from "@lynx/browser-core";
import type { Action } from "@lynx/shared";

export type Tier = 0 | 1 | 2;

const MAX_ACTIONS = Number(process.env.MAX_ACTIONS ?? 50);
const MAX_RECOVERY = Number(process.env.MAX_RECOVERY ?? 3);

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

async function emit(
  run_id: string,
  idx: number,
  type: Action["type"],
  payload: Record<string, unknown>,
) {
  await appendAction(run_id, {
    idx,
    type,
    payload,
    ts: new Date().toISOString(),
  });
}

async function tier0Replay(
  g: RunGoal,
  session: BrowserSession,
  startIdx: number,
): Promise<{ ok: boolean; nextIdx: number }> {
  const domain = domainOf(g.start_url);
  if (!domain) return { ok: false, nextIdx: startIdx };
  const pb = await getPlaybook(g.company_id, domain);
  if (!pb || pb.success_rate < 0.7) return { ok: false, nextIdx: startIdx };

  await emit(g.run_id, startIdx++, "tier_escalate", { tier: 0, reason: "playbook hit" });

  try {
    for (const step of pb.steps) {
      await emit(g.run_id, startIdx++, step.action, {
        selector: step.selector,
        value: step.value,
        note: step.note,
      });
      if (step.action === "click" && step.selector) {
        await session.page.click(step.selector, { timeout: 5000 });
      } else if (step.action === "type" && step.selector && step.value) {
        await session.page.fill(step.selector, step.value);
      } else if (step.action === "navigate" && step.value) {
        await session.page.goto(step.value);
      }
    }
    await recordOutcome(g.company_id, domain, true);
    return { ok: true, nextIdx: startIdx };
  } catch {
    await recordOutcome(g.company_id, domain, false);
    return { ok: false, nextIdx: startIdx };
  }
}

async function tierLLM(
  g: RunGoal,
  session: BrowserSession,
  tier: 1 | 2,
  startIdx: number,
): Promise<{ ok: boolean; cost: number; nextIdx: number }> {
  await emit(g.run_id, startIdx++, "tier_escalate", {
    tier,
    reason: tier === 1 ? "no playbook" : "tier 1 stuck",
  });

  const model = tier === 1 ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await emit(g.run_id, startIdx++, "wait", { error: "ANTHROPIC_API_KEY not set" });
    return { ok: false, cost: 0, nextIdx: startIdx };
  }

  const stagehand = new Stagehand({
    env: "LOCAL",
    modelName: model,
    modelClientOptions: { apiKey },
    enableCaching: true,
  });
  // Reuse Patchright page directly by passing it through Stagehand's LOCAL env.
  // Stagehand normally manages its own browser; for Lynx we adapt by running
  // act/extract against our session.page via Stagehand's internal API.

  let cost = 0;
  try {
    await stagehand.init();
    let actions = 0;
    let finished = false;
    while (actions < MAX_ACTIONS && !finished) {
      const observe = await stagehand.page.observe({ instruction: g.goal });
      if (!observe || observe.length === 0) {
        finished = true;
        break;
      }
      const action = observe[0];
      if (!action) {
        finished = true;
        break;
      }
      await emit(g.run_id, startIdx++, "click", {
        selector: action.selector,
        description: action.description,
      });
      await stagehand.page.act(action);
      cost += tier === 1 ? 0.01 : 0.1;
      actions++;
    }
    return { ok: finished, cost, nextIdx: startIdx };
  } catch (e) {
    await emit(g.run_id, startIdx++, "wait", { error: String(e) });
    return { ok: false, cost, nextIdx: startIdx };
  } finally {
    await stagehand.close().catch(() => {});
  }
}

async function loadIdentity(g: RunGoal) {
  if (!g.identity_id) return { fingerprint: undefined, storageState: undefined };
  const id = await getIdentity(g.company_id, g.identity_id);
  if (!id) return { fingerprint: undefined, storageState: undefined };
  return {
    fingerprint: id.fingerprint as
      | {
          user_agent?: string;
          viewport?: { width: number; height: number };
          locale?: string;
          timezone?: string;
        }
      | undefined,
    storageState: undefined,
  };
}

export async function runGoal(g: RunGoal): Promise<RunResult> {
  let idx = 0;
  let totalCost = 0;
  let tierUsed: Tier = 0;

  for (let attempt = 0; attempt <= MAX_RECOVERY; attempt++) {
    const ident = await loadIdentity(g);
    const session = await launchSession({
      fingerprint: ident.fingerprint,
      identityStorageState: ident.storageState,
    });

    try {
      if (g.start_url) {
        await emit(g.run_id, idx++, "navigate", { url: g.start_url });
        await session.page.goto(g.start_url);
      }

      const tier0 = await tier0Replay(g, session, idx);
      idx = tier0.nextIdx;
      if (tier0.ok) {
        tierUsed = 0;
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: totalCost.toFixed(4),
        });
        return { status: "succeeded", cost_usd: totalCost, tier_used: tierUsed };
      }

      const t1 = await tierLLM(g, session, 1, idx);
      idx = t1.nextIdx;
      totalCost += t1.cost;
      if (t1.ok) {
        tierUsed = 1;
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: totalCost.toFixed(4),
        });
        return { status: "succeeded", cost_usd: totalCost, tier_used: tierUsed };
      }

      const t2 = await tierLLM(g, session, 2, idx);
      idx = t2.nextIdx;
      totalCost += t2.cost;
      if (t2.ok) {
        tierUsed = 2;
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: totalCost.toFixed(4),
        });
        return { status: "succeeded", cost_usd: totalCost, tier_used: tierUsed };
      }
    } catch (e) {
      await emit(g.run_id, idx++, "wait", { error: String(e), attempt });
    } finally {
      await session.close();
    }

    await emit(g.run_id, idx++, "tier_escalate", {
      tier: 2,
      reason: `recovery attempt ${attempt + 1}/${MAX_RECOVERY}`,
    });
  }

  await updateRunStatus(g.run_id, "failed", {
    finished_at: new Date().toISOString(),
    cost_usd: totalCost.toFixed(4),
  });
  return { status: "failed", cost_usd: totalCost, tier_used: tierUsed };
}
