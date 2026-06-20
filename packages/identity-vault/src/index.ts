import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { bbSelect, bbInsert, bbUpdateById } from "@lynx/shared";

export interface Identity {
  id: string;
  company_id: string;
  label: string;
  email: string | null;
  phone: string | null;
  fingerprint: Record<string, unknown> | null;
  storage_state_url: string | null;
  storage_state_json: Record<string, unknown> | null;
  created_at: string;
}

export interface IdentityInput {
  company_id: string;
  label: string;
  email?: string;
  phone?: string;
  payment_token?: string;
  fingerprint?: Record<string, unknown>;
  storage_state_url?: string;
}

interface Row {
  id: string;
  company_id: string;
  label: string;
  email: string | null;
  phone: string | null;
  fingerprint_json: Record<string, unknown> | null;
  storage_state_url: string | null;
  storage_state_json: Record<string, unknown> | null;
  created_at: string;
}

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.IDENTITY_ENCRYPTION_KEY;
  if (!raw) throw new Error("IDENTITY_ENCRYPTION_KEY not set");
  return scryptSync(raw, "lynx-identity-vault", 32);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function toIdentity(r: Row): Identity {
  return {
    id: r.id,
    company_id: r.company_id,
    label: r.label,
    email: r.email,
    phone: r.phone,
    fingerprint: r.fingerprint_json,
    storage_state_url: r.storage_state_url,
    storage_state_json: r.storage_state_json,
    created_at: r.created_at,
  };
}

export async function updateStorageState(
  id: string,
  storage_state: Record<string, unknown>,
): Promise<void> {
  await bbUpdateById("lynx_identities", id, {
    storage_state_json: storage_state,
  });
}

export async function createIdentity(input: IdentityInput): Promise<Identity> {
  const encryptedPaymentToken = input.payment_token ? encrypt(input.payment_token) : null;
  const row = await bbInsert<Row>("lynx_identities", {
    company_id: input.company_id,
    label: input.label,
    email: input.email ?? null,
    phone: input.phone ?? null,
    payment_token: encryptedPaymentToken,
    fingerprint_json: input.fingerprint ?? null,
    storage_state_url: input.storage_state_url ?? null,
  });
  return toIdentity(row);
}

export async function getIdentity(company_id: string, id: string): Promise<Identity | null> {
  const rows = await bbSelect<Row>(
    "lynx_identities",
    { company_id: `eq.${company_id}`, id: `eq.${id}` },
    { limit: 1 },
  );
  return rows[0] ? toIdentity(rows[0]) : null;
}

export async function listIdentities(company_id: string): Promise<Identity[]> {
  const rows = await bbSelect<Row>(
    "lynx_identities",
    { company_id: `eq.${company_id}` },
    { order: "created_at.desc" },
  );
  return rows.map(toIdentity);
}
