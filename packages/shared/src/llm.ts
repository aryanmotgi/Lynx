// Butterbase AI gateway — OpenAI-compatible chat completions.
// All LLM calls in Lynx route through here. No direct Anthropic/OpenAI SDK.

const DEFAULT_BASE = "https://api.butterbase.ai/v1";

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" };
}

export interface ChatChoice {
  index: number;
  message: { role: "assistant"; content: string };
  finish_reason: string;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function gatewayUrl(): string {
  const id = process.env.BUTTERBASE_APP_ID;
  if (!id) throw new Error("BUTTERBASE_APP_ID not set");
  const base = process.env.BUTTERBASE_API_BASE ?? DEFAULT_BASE;
  return `${base.replace(/\/$/, "")}/${id}/chat/completions`;
}

function key(): string {
  const k = process.env.BUTTERBASE_API_KEY;
  if (!k) throw new Error("BUTTERBASE_API_KEY not set");
  return k;
}

export async function butterbaseChat(req: ChatRequest): Promise<ChatResponse> {
  const r = await fetch(gatewayUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Butterbase chat failed: ${r.status} ${text}`);
  }
  return (await r.json()) as ChatResponse;
}

// Convenience: ask for JSON and parse it. Strips markdown fences and
// salvages JSON objects from LLM responses that wrap them in prose.
export async function butterbaseChatJSON<T>(req: ChatRequest): Promise<T> {
  const res = await butterbaseChat({
    ...req,
    response_format: { type: "json_object" },
  });
  const content = res.choices[0]?.message.content;
  if (!content) throw new Error("Butterbase chat returned empty content");
  return parseLooseJSON<T>(content);
}

function parseLooseJSON<T>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence?.[1]) s = fence[1].trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(s.slice(first, last + 1)) as T;
    }
    throw new Error(`butterbaseChatJSON: could not parse: ${raw.slice(0, 200)}`);
  }
}
