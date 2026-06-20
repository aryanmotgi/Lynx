// browser-core: Patchright (Playwright stealth fork) Chrome lifecycle.
//
// One BrowserSession per process (per VM at deploy time). Identity
// storageState loaded on launch, persisted on close.

import { chromium, type Browser, type BrowserContext, type Page } from "patchright";

export interface BrowserSessionOptions {
  identityStorageState?: Record<string, unknown> | string;
  fingerprint?: {
    user_agent?: string;
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
  };
  proxy?: { server: string; username?: string; password?: string };
  headless?: boolean;
}

export class BrowserSession {
  constructor(
    public readonly browser: Browser,
    public readonly context: BrowserContext,
    public readonly page: Page,
  ) {}

  async dumpStorageState(): Promise<Record<string, unknown>> {
    return (await this.context.storageState()) as Record<string, unknown>;
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }
}

export async function launchSession(opts: BrowserSessionOptions = {}): Promise<BrowserSession> {
  const browser = await chromium.launch({
    headless: opts.headless ?? true,
    proxy: opts.proxy,
  });
  const context = await browser.newContext({
    userAgent: opts.fingerprint?.user_agent,
    viewport: opts.fingerprint?.viewport ?? { width: 1920, height: 1080 },
    locale: opts.fingerprint?.locale ?? "en-US",
    timezoneId: opts.fingerprint?.timezone ?? "America/Los_Angeles",
    storageState: opts.identityStorageState as never,
  });
  const page = await context.newPage();
  return new BrowserSession(browser, context, page);
}
