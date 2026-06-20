import { bbInsert, bbSelect } from "@lynx/shared";

export type SpendKind = "llm" | "infra" | "captcha" | "proxy";

export interface SpendEntry {
  company_id: string;
  run_id?: string;
  kind: SpendKind;
  amount_usd: number;
}

export async function logSpend(e: SpendEntry): Promise<void> {
  await bbInsert("lynx_spend_log", {
    company_id: e.company_id,
    run_id: e.run_id ?? null,
    kind: e.kind,
    amount_usd: e.amount_usd,
  });
}

interface SumRow {
  amount_usd: string;
}

export async function dailySpend(company_id: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await bbSelect<SumRow>("lynx_spend_log", {
    company_id: `eq.${company_id}`,
    ts: `gt.${since}`,
  });
  return rows.reduce((acc, r) => acc + Number(r.amount_usd), 0);
}
