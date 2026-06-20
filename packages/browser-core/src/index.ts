// browser-core: Patchright Chrome lifecycle + CDP wrapper.
// TODO Phase 1: port keepers from vendor/steel-reference.

export interface BrowserSessionOptions {
  identityStorageStateUrl?: string;
  fingerprint?: Record<string, unknown>;
  proxy?: string;
}

export interface BrowserSession {
  id: string;
  close(): Promise<void>;
}

export async function launchSession(_opts: BrowserSessionOptions): Promise<BrowserSession> {
  throw new Error("not implemented — Phase 1");
}
