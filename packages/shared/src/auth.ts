import { createHash } from "node:crypto";
import { bbSelect } from "./butterbase";

export interface Company {
  id: string;
  name: string;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function companyByApiKey(raw: string): Promise<Company | null> {
  const hash = hashApiKey(raw);
  const rows = await bbSelect<Company>(
    "lynx_companies",
    { api_key_hash: `eq.${hash}` },
    { select: "id,name", limit: 1 },
  );
  return rows[0] ?? null;
}
