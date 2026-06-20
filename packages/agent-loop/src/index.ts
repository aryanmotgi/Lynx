// agent-loop: observe → decide → act with tier escalation.
//
// All LLM traffic goes through the Butterbase AI gateway (OpenAI-compatible).
// No direct Anthropic / OpenAI SDK usage.
//
// Tier 0: deterministic playbook replay (~$0)
// Tier 1: anthropic/claude-haiku-4.5 over Butterbase gateway (cheap)
// Tier 2: anthropic/claude-sonnet-4.6 over Butterbase gateway (powerful)
//
// Recovery: on stuck, spawn up to MAX_RECOVERY fresh sessions before failing.

import { getPlaybook, recordOutcome } from "@lynx/playbook-store";
import {
  appendAction,
  updateRunStatus,
  writeMemoryEntry,
  butterbaseChatJSON,
} from "@lynx/shared";
import { getIdentity } from "@lynx/identity-vault";
import { launchSession, type BrowserSession } from "@lynx/browser-core";
import type { Action } from "@lynx/shared";

export type Tier = 0 | 1 | 2;

const MAX_ACTIONS = Number(process.env.MAX_ACTIONS ?? 50);
const MAX_RECOVERY = Number(process.env.MAX_RECOVERY ?? 3);

const MODEL_TIER1 = process.env.LYNX_MODEL_TIER1 ?? "anthropic/claude-haiku-4.5";
const MODEL_TIER2 = process.env.LYNX_MODEL_TIER2 ?? "anthropic/claude-sonnet-4.6";

const COST_TIER1_PER_ACTION = Number(process.env.LYNX_COST_TIER1 ?? 0.01);
const COST_TIER2_PER_ACTION = Number(process.env.LYNX_COST_TIER2 ?? 0.1);

export interface RunGoal {
  run_id: string;
  company_id: string;
  goal: string;
  start_url?: string;
  identity_id?: string;
}

export interface RunResult {
  status: "succeeded" | "failed";
  cost_usd: number;
  tier_used: Tier;
}

interface AgentDecision {
  finished: boolean;
  action?: "click" | "type" | "navigate" | "scroll" | "wait";
  selector?: string;
  value?: string;
  reasoning?: string;
}

function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function emit(
  run_id: string,
  idx: number,
  type: Action["type"],
  payload: Record<string, unknown>,
) {
  await appendAction(run_id, {
    idx,
    type,
    payload,
    ts: new Date().toISOString(),
  });
}

async function snapshotPage(session: BrowserSession): Promise<string> {
  // Lightweight accessibility-tree-ish snapshot: visible interactive elements.
  // Returns truncated HTML good enough for the LLM to pick the next selector.
  return await session.page.evaluate(() => {
    const out: string[] = [];
    const els = document.querySelectorAll(
      "a, button, input, textarea, select, [role=button], [role=link]",
    );
    let i = 0;
    for (const el of Array.from(els).slice(0, 80)) {
      const h = el as HTMLElement;
      const tag = h.tagName.toLowerCase();
      const id = h.id ? `#${h.id}` : "";
      const cls = h.className && typeof h.className === "string"
        ? `.${h.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
        : "";
      const txt = (h.innerText || h.getAttribute("aria-label") || h.getAttribute("placeholder") || "")
        .trim()
        .slice(0, 60);
      out.push(`${i++}: <${tag}${id}${cls}> ${txt}`);
    }
    return out.join("\n");
  });
}

async function decide(
  goal: string,
  snapshot: string,
  url: string,
  history: string[],
  model: string,
): Promise<AgentDecision> {
  const sys = `You are a web automation agent. Output JSON only: { finished: boolean, action: "click"|"type"|"navigate"|"scroll"|"wait", selector: string, value: string, reasoning: string }. Use CSS selectors. Be conservative — finished=true only when the goal is clearly achieved.`;
  const user = `Goal: ${goal}\nURL: ${url}\nRecent actions: ${history.slice(-5).join(" | ") || "none"}\n\nVisible interactive elements:\n${snapshot}\n\nWhat is the next single action?`;
  return await butterbaseChatJSON<AgentDecision>({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    max_tokens: 400,
    temperature: 0.1,
  });
}

async function tier0Replay(
  g: RunGoal,
  session: BrowserSession,
  startIdx: number,
): Promise<{ ok: boolean; nextIdx: number }> {
  const domain = domainOf(g.start_url);
  if (!domain) return { ok: false, nextIdx: startIdx };
  const pb = await getPlaybook(g.company_id, domain);
  if (!pb || pb.success_rate < 0.7) return { ok: false, nextIdx: startIdx };

  await emit(g.run_id, startIdx++, "tier_escalate", { tier: 0, reason: "playbook hit" });

  try {
    for (const step of pb.steps) {
      await emit(g.run_id, startIdx++, step.action, {
        selector: step.selector,
        value: step.value,
        note: step.note,
      });
      if (step.action === "click" && step.selector) {
        await session.page.click(step.selector, { timeout: 5000 });
      } else if (step.action === "type" && step.selector && step.value) {
        await session.page.fill(step.selector, step.value);
      } else if (step.action === "navigate" && step.value) {
        await session.page.goto(step.value);
      }
    }
    await recordOutcome(g.company_id, domain, true);
    return { ok: true, nextIdx: startIdx };
  } catch {
    await recordOutcome(g.company_id, domain, false);
    return { ok: false, nextIdx: startIdx };
  }
}

async function extractPageText(session: BrowserSession): Promise<string> {
  return await session.page.evaluate(() => {
    const t = (document.body?.innerText ?? "").trim();
    return t.slice(0, 2000);
  });
}

async function summarizeFindings(
  goal: string,
  url: string,
  text: string,
  model: string,
): Promise<string> {
  try {
    const res = await butterbaseChatJSON<{ summary: string }>({
      model,
      messages: [
        {
          role: "system",
          content: 'Output JSON only: { "summary": string }. Summarize in ≤2 sentences what was found relevant to the goal on this page.',
        },
        {
          role: "user",
          content: `Goal: ${goal}\nURL: ${url}\nPage text (truncated):\n${text}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });
    return res.summary ?? text.slice(0, 400);
  } catch {
    return text.slice(0, 400);
  }
}

function sameRegistrableDomain(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname;
    const hb = new URL(b).hostname;
    if (ha === hb) return true;
    // Treat subdomains of the same eTLD+1 as same site (best-effort, no PSL).
    const lastTwo = (h: string) => h.split(".").slice(-2).join(".");
    return lastTwo(ha) === lastTwo(hb);
  } catch {
    return false;
  }
}

async function tierLLM(
  g: RunGoal,
  session: BrowserSession,
  tier: 1 | 2,
  startIdx: number,
): Promise<{ ok: boolean; cost: number; nextIdx: number }> {
  await emit(g.run_id, startIdx++, "tier_escalate", {
    tier,
    reason: tier === 1 ? "no playbook" : "tier 1 stuck",
  });

  const model = tier === 1 ? MODEL_TIER1 : MODEL_TIER2;
  const perAction = tier === 1 ? COST_TIER1_PER_ACTION : COST_TIER2_PER_ACTION;

  let cost = 0;
  const history: string[] = [];
  let actions = 0;
  let repeatedScrolls = 0;
  const MAX_REPEATED_SCROLLS = 3;

  while (actions < MAX_ACTIONS) {
    const snapshot = await snapshotPage(session);
    const url = session.page.url();

    // Domain clamp: if we've drifted off the original site, stop, extract, finish.
    if (g.start_url && !sameRegistrableDomain(url, g.start_url)) {
      const text = await extractPageText(session);
      const summary = await summarizeFindings(g.goal, url, text, model);
      cost += perAction;
      await emit(g.run_id, startIdx++, "extract", {
        reason: "domain_drift_stop",
        original_url: g.start_url,
        current_url: url,
        summary,
      });
      return { ok: true, cost, nextIdx: startIdx };
    }
    let decision: AgentDecision;
    try {
      decision = await decide(g.goal, snapshot, url, history, model);
    } catch (e) {
      await emit(g.run_id, startIdx++, "wait", { error: String(e) });
      return { ok: false, cost, nextIdx: startIdx };
    }
    cost += perAction;

    if (decision.finished) {
      await emit(g.run_id, startIdx++, "wait", { finished: true, reasoning: decision.reasoning });
      return { ok: true, cost, nextIdx: startIdx };
    }

    if (!decision.action) {
      await emit(g.run_id, startIdx++, "wait", { error: "no action returned" });
      return { ok: false, cost, nextIdx: startIdx };
    }

    const actType = decision.action === "wait" ? "wait" : decision.action;
    await emit(g.run_id, startIdx++, actType as Action["type"], {
      selector: decision.selector,
      value: decision.value,
      reasoning: decision.reasoning,
    });

    try {
      if (decision.action === "click" && decision.selector) {
        await session.page.click(decision.selector, { timeout: 8000 });
      } else if (decision.action === "type" && decision.selector && decision.value !== undefined) {
        await session.page.fill(decision.selector, decision.value);
      } else if (decision.action === "navigate" && decision.value) {
        await session.page.goto(decision.value);
      } else if (decision.action === "scroll") {
        await session.page.evaluate(() => window.scrollBy(0, 600));
      } else if (decision.action === "wait") {
        await session.page.waitForTimeout(1000);
      }
    } catch (e) {
      await emit(g.run_id, startIdx++, "wait", { error: String(e) });
      return { ok: false, cost, nextIdx: startIdx };
    }

    history.push(`${decision.action} ${decision.selector ?? ""} ${decision.value ?? ""}`);
    actions++;

    // Repeated-scroll guard: if the agent scrolls N times in a row with no
    // other action, treat it as stuck, extract, and finish.
    if (decision.action === "scroll") {
      repeatedScrolls += 1;
      if (repeatedScrolls >= MAX_REPEATED_SCROLLS) {
        const text = await extractPageText(session);
        const summary = await summarizeFindings(g.goal, url, text, model);
        cost += perAction;
        await emit(g.run_id, startIdx++, "extract", {
          reason: "repeated_scroll_stop",
          current_url: url,
          summary,
        });
        return { ok: true, cost, nextIdx: startIdx };
      }
    } else {
      repeatedScrolls = 0;
    }
  }

  await emit(g.run_id, startIdx++, "wait", { error: "MAX_ACTIONS exceeded" });
  return { ok: false, cost, nextIdx: startIdx };
}

async function loadIdentity(g: RunGoal) {
  if (!g.identity_id) return { fingerprint: undefined };
  const id = await getIdentity(g.company_id, g.identity_id);
  if (!id) return { fingerprint: undefined };
  return {
    fingerprint: id.fingerprint as
      | {
          user_agent?: string;
          viewport?: { width: number; height: number };
          locale?: string;
          timezone?: string;
        }
      | undefined,
  };
}

async function reportToMemory(
  g: RunGoal,
  status: "succeeded" | "failed",
  cost_usd: number,
  tier_used: Tier,
) {
  try {
    await writeMemoryEntry({
      agent: "lynx",
      type: "browser_run",
      summary: `${status} — ${g.goal.slice(0, 120)}`,
      outcome: status,
      task_id: g.run_id,
      detail: {
        company_id: g.company_id,
        run_id: g.run_id,
        goal: g.goal,
        start_url: g.start_url ?? null,
        identity_id: g.identity_id ?? null,
        tier_used,
        cost_usd,
      },
    });
  } catch (e) {
    console.error("[agent-loop] memory_entries write failed:", e);
  }
}

export async function runGoal(g: RunGoal): Promise<RunResult> {
  let idx = 0;
  let totalCost = 0;
  let tierUsed: Tier = 0;

  for (let attempt = 0; attempt <= MAX_RECOVERY; attempt++) {
    const ident = await loadIdentity(g);
    const session = await launchSession({ fingerprint: ident.fingerprint });

    try {
      if (g.start_url) {
        await emit(g.run_id, idx++, "navigate", { url: g.start_url });
        await session.page.goto(g.start_url);
      }

      const t0 = await tier0Replay(g, session, idx);
      idx = t0.nextIdx;
      if (t0.ok) {
        tierUsed = 0;
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: totalCost.toFixed(4),
        });
        await reportToMemory(g, "succeeded", totalCost, tierUsed);
        return { status: "succeeded", cost_usd: totalCost, tier_used: tierUsed };
      }

      const t1 = await tierLLM(g, session, 1, idx);
      idx = t1.nextIdx;
      totalCost += t1.cost;
      if (t1.ok) {
        tierUsed = 1;
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: totalCost.toFixed(4),
        });
        await reportToMemory(g, "succeeded", totalCost, tierUsed);
        return { status: "succeeded", cost_usd: totalCost, tier_used: tierUsed };
      }

      const t2 = await tierLLM(g, session, 2, idx);
      idx = t2.nextIdx;
      totalCost += t2.cost;
      if (t2.ok) {
        tierUsed = 2;
        await updateRunStatus(g.run_id, "succeeded", {
          finished_at: new Date().toISOString(),
          cost_usd: totalCost.toFixed(4),
        });
        await reportToMemory(g, "succeeded", totalCost, tierUsed);
        return { status: "succeeded", cost_usd: totalCost, tier_used: tierUsed };
      }
    } catch (e) {
      await emit(g.run_id, idx++, "wait", { error: String(e), attempt });
    } finally {
      await session.close();
    }

    await emit(g.run_id, idx++, "tier_escalate", {
      tier: 2,
      reason: `recovery attempt ${attempt + 1}/${MAX_RECOVERY}`,
    });
  }

  await updateRunStatus(g.run_id, "failed", {
    finished_at: new Date().toISOString(),
    cost_usd: totalCost.toFixed(4),
  });
  await reportToMemory(g, "failed", totalCost, tierUsed);
  return { status: "failed", cost_usd: totalCost, tier_used: tierUsed };
}
