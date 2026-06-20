import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { withTenant } from "@lynx/shared";

export interface Identity {
  id: string;
  company_id: string;
  label: string;
  email: string | null;
  phone: string | null;
  fingerprint: Record<string, unknown> | null;
  storage_state_url: string | null;
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

export async function createIdentity(input: IdentityInput): Promise<Identity> {
  return withTenant(input.company_id, async (c) => {
    const encryptedPaymentToken = input.payment_token ? encrypt(input.payment_token) : null;
    const r = await c.query(
      `insert into identities (company_id, label, email, phone, payment_token, fingerprint_json, storage_state_url)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning id, company_id, label, email, phone, fingerprint_json as fingerprint, storage_state_url, created_at`,
      [
        input.company_id,
        input.label,
        input.email ?? null,
        input.phone ?? null,
        encryptedPaymentToken,
        input.fingerprint ?? null,
        input.storage_state_url ?? null,
      ],
    );
    return r.rows[0] as Identity;
  });
}

export async function getIdentity(company_id: string, id: string): Promise<Identity | null> {
  return withTenant(company_id, async (c) => {
    const r = await c.query(
      `select id, company_id, label, email, phone, fingerprint_json as fingerprint, storage_state_url, created_at
       from identities where id = $1`,
      [id],
    );
    return (r.rows[0] as Identity) ?? null;
  });
}

export async function listIdentities(company_id: string): Promise<Identity[]> {
  return withTenant(company_id, async (c) => {
    const r = await c.query(
      `select id, company_id, label, email, phone, fingerprint_json as fingerprint, storage_state_url, created_at
       from identities order by created_at desc`,
    );
    return r.rows as Identity[];
  });
}
