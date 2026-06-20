// @lynx/client — TypeScript SDK for Atlas (or any caller) to talk to Lynx.

export interface LynxClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface DispatchInput {
  goal: string;
  start_url?: string;
  identity_id?: string;
  max_actions?: number;
}

export interface DispatchResponse {
  run_id: string;
  status: string;
  status_url: string;
  stream_url: string;
}

export interface RunRecord {
  id: string;
  company_id: string;
  goal: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  cost_usd: string;
  start_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  video_url: string | null;
}

export class LynxClient {
  private baseUrl: string;
  private apiKey: string;
  private f: typeof fetch;

  constructor(opts: LynxClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.f = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async dispatch(input: DispatchInput): Promise<DispatchResponse> {
    const r = await this.f(`${this.baseUrl}/v1/dispatch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`dispatch failed: ${r.status} ${await r.text()}`);
    return (await r.json()) as DispatchResponse;
  }

  async getRun(run_id: string): Promise<RunRecord> {
    const r = await this.f(`${this.baseUrl}/v1/runs/${run_id}`, {
      headers: this.headers(),
    });
    if (!r.ok) throw new Error(`getRun failed: ${r.status}`);
    return (await r.json()) as RunRecord;
  }

  async *stream(run_id: string): AsyncGenerator<unknown> {
    const r = await this.f(`${this.baseUrl}/v1/runs/${run_id}/stream`, {
      headers: this.headers(),
    });
    if (!r.ok || !r.body) throw new Error(`stream failed: ${r.status}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value);
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (line) yield JSON.parse(line.slice(6));
      }
    }
  }

  async waitForRun(run_id: string, pollMs = 1000): Promise<RunRecord> {
    for (;;) {
      const run = await this.getRun(run_id);
      if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
        return run;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}
