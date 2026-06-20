// budget: per-company spend tracking. No hard cap (per user decision); log + alert only.
// TODO Phase 5: Postgres spend_log, daily aggregate.

export type SpendKind = "llm" | "infra" | "captcha" | "proxy";

export interface SpendEntry {
  company_id: string;
  run_id: string;
  kind: SpendKind;
  amount_usd: number;
}

export async function logSpend(_e: SpendEntry): Promise<void> {
  throw new Error("not implemented — Phase 5");
}

export async function dailySpend(_company_id: string): Promise<number> {
  throw new Error("not implemented — Phase 5");
}
