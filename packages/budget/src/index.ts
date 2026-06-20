import { db } from "@lynx/shared";

export type SpendKind = "llm" | "infra" | "captcha" | "proxy";

export interface SpendEntry {
  company_id: string;
  run_id?: string;
  kind: SpendKind;
  amount_usd: number;
}

export async function logSpend(e: SpendEntry): Promise<void> {
  await db().query(
    `insert into spend_log (company_id, run_id, kind, amount_usd) values ($1, $2, $3, $4)`,
    [e.company_id, e.run_id ?? null, e.kind, e.amount_usd],
  );
}

export async function dailySpend(company_id: string): Promise<number> {
  const r = await db().query(
    `select coalesce(sum(amount_usd), 0) as total
     from spend_log
     where company_id = $1 and ts > now() - interval '24 hours'`,
    [company_id],
  );
  return Number(r.rows[0].total);
}
