// Butterbase REST client for Lynx.
//
// Persistence over https://api.butterbase.ai/v1/<app_id>.
// Service key (bb_sk_*) authenticates as butterbase_service (bypasses RLS).
// Tenant isolation enforced in app code via mandatory company_id filter.
//
// PATCH and DELETE per Butterbase REST require /{table}/{id} (primary key
// in path). Use bbUpdateById / bbDeleteById. Multi-row updates: fetch ids
// first via bbSelect, then patch each.

const DEFAULT_BASE = "https://api.butterbase.ai/v1";

function appId(): string {
  const id = process.env.BUTTERBASE_APP_ID;
  if (!id) throw new Error("BUTTERBASE_APP_ID not set");
  return id;
}

function apiBase(): string {
  const base = process.env.BUTTERBASE_API_BASE ?? DEFAULT_BASE;
  return `${base.replace(/\/$/, "")}/${appId()}`;
}

function key(): string {
  const k = process.env.BUTTERBASE_API_KEY;
  if (!k) throw new Error("BUTTERBASE_API_KEY not set");
  return k;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${key()}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function qs(filters: Record<string, string> = {}, opts: ListOptions = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) params.append(k, v);
  if (opts.select) params.set("select", opts.select);
  if (opts.order) params.set("order", opts.order);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export interface ListOptions {
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

export async function bbSelect<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, string> = {},
  opts: ListOptions = {},
): Promise<T[]> {
  const url = `${apiBase()}/${table}${qs(filters, opts)}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`bbSelect ${table} failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as T[];
}

export async function bbGetById<T = Record<string, unknown>>(
  table: string,
  id: string,
): Promise<T | null> {
  const url = `${apiBase()}/${table}/${encodeURIComponent(id)}`;
  const r = await fetch(url, { headers: headers() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`bbGetById ${table} failed: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

export async function bbInsert<T = Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>,
): Promise<T> {
  const url = `${apiBase()}/${table}`;
  const r = await fetch(url, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`bbInsert ${table} failed: ${r.status} ${await r.text()}`);
  const body = await r.json();
  return (Array.isArray(body) ? body[0] : body) as T;
}

export async function bbUpdateById<T = Record<string, unknown>>(
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<T | null> {
  const url = `${apiBase()}/${table}/${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`bbUpdateById ${table} failed: ${r.status} ${await r.text()}`);
  const body = await r.json();
  return (Array.isArray(body) ? body[0] : body) as T;
}

export async function bbDeleteById(table: string, id: string): Promise<void> {
  const url = `${apiBase()}/${table}/${encodeURIComponent(id)}`;
  const r = await fetch(url, { method: "DELETE", headers: headers() });
  if (!r.ok && r.status !== 404) {
    throw new Error(`bbDeleteById ${table} failed: ${r.status} ${await r.text()}`);
  }
}
