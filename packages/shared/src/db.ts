import { Pool, type PoolClient } from "pg";

let _pool: Pool | null = null;

export function db(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    _pool = new Pool({ connectionString: url, max: 10 });
  }
  return _pool;
}

export async function withTenant<T>(
  company_id: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("select set_config('lynx.company_id', $1, true)", [company_id]);
    return await fn(client);
  } finally {
    client.release();
  }
}
