// agent-loop: observe → decide → act. Tier escalation.
// Tier 0: deterministic playbook replay (~$0)
// Tier 1: Haiku + AX tree (~$0.01/action)
// Tier 2: Sonnet 4.6 + vision (~$0.10/action)
// TODO Phase 3: Stagehand wrapper, Claude SDK, tier router.

export type Tier = 0 | 1 | 2;

export interface RunGoal {
  run_id: string;
  company_id: string;
  goal: string;
  start_url?: string;
  identity_id?: string;
}

export async function runGoal(_g: RunGoal): Promise<{ status: "succeeded" | "failed"; cost_usd: number }> {
  throw new Error("not implemented — Phase 3");
}
