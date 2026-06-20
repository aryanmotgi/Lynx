// identity-vault: per-company encrypted identities (creds, cookies, storageState, fingerprint).
// TODO Phase 2: AES-256 at rest, R2-backed storageState URLs.

export interface Identity {
  id: string;
  company_id: string;
  label: string;
  email?: string;
  phone?: string;
  storage_state_url?: string;
  fingerprint?: Record<string, unknown>;
}

export async function getIdentity(_id: string): Promise<Identity | null> {
  throw new Error("not implemented — Phase 2");
}
