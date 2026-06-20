import { createHash } from "node:crypto";
import { db } from "./db";

export interface Company {
  id: string;
  name: string;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function companyByApiKey(raw: string): Promise<Company | null> {
  const hash = hashApiKey(raw);
  const r = await db().query(
    `select id, name from companies where api_key_hash = $1`,
    [hash],
  );
  return (r.rows[0] as Company) ?? null;
}
