import type { FastifyPluginAsync } from "fastify";
import { bbSelect, getRun } from "@lynx/shared";

interface ActionRow {
  idx: number;
  type: string;
  payload_json: Record<string, unknown>;
  ts: string;
}

/**
 * Walk actions in reverse and surface the best available page content.
 * Priority:
 *   1. extract action with summary (run_complete, domain_drift_stop, repeated_scroll_stop)
 *   2. wait action with kind=done_check (LLM reason)
 *   3. wait action with finished=true (LLM reasoning)
 *   4. null
 */
function deriveFinalSummary(actions: ActionRow[]): {
  final_summary: string | null;
  final_source: string | null;
  current_url: string | null;
  page_text: string | null;
} {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (!a) continue;
    const p = a.payload_json || {};
    if (a.type === "extract" && typeof p.summary === "string" && p.summary.trim()) {
      return {
        final_summary: String(p.summary),
        final_source: `extract:${String(p.reason ?? "extract")}`,
        current_url: typeof p.current_url === "string" ? p.current_url : null,
        page_text: typeof p.page_text === "string" ? p.page_text : null,
      };
    }
  }
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (!a) continue;
    const p = a.payload_json || {};
    if (a.type === "wait" && p.kind === "done_check" && typeof p.reason === "string") {
      return {
        final_summary: String(p.reason),
        final_source: "wait:done_check",
        current_url: null,
        page_text: null,
      };
    }
  }
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (!a) continue;
    const p = a.payload_json || {};
    if (a.type === "wait" && p.finished === true && typeof p.reasoning === "string") {
      return {
        final_summary: String(p.reasoning),
        final_source: "wait:finished",
        current_url: null,
        page_text: null,
      };
    }
  }
  return { final_summary: null, final_source: null, current_url: null, page_text: null };
}

async function fetchActions(run_id: string): Promise<ActionRow[]> {
  return await bbSelect<ActionRow>(
    "lynx_actions",
    { run_id: `eq.${run_id}` },
    { order: "idx.asc" },
  );
}

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const run = await getRun(req.company_id, req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    const actions = await fetchActions(req.params.id);
    const derived = deriveFinalSummary(actions);
    return {
      ...run,
      final_summary: derived.final_summary,
      final_source: derived.final_source,
      current_url: derived.current_url,
      page_text: derived.page_text,
      action_count: actions.length,
    };
  });

  app.get<{ Params: { id: string } }>("/runs/:id/stream", async (req, reply) => {
    const run = await getRun(req.company_id, req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let lastIdx = -1;
    const interval = setInterval(async () => {
      const rows = await bbSelect<ActionRow>(
        "lynx_actions",
        { run_id: `eq.${req.params.id}`, idx: `gt.${lastIdx}` },
        { order: "idx.asc" },
      );
      for (const row of rows) {
        lastIdx = row.idx;
        reply.raw.write(
          `data: ${JSON.stringify({
            idx: row.idx,
            type: row.type,
            payload: row.payload_json,
            ts: row.ts,
          })}\n\n`,
        );
      }
      const cur = await getRun(req.company_id, req.params.id);
      if (cur && (cur.status === "succeeded" || cur.status === "failed" || cur.status === "cancelled")) {
        const all = await fetchActions(req.params.id);
        const derived = deriveFinalSummary(all);
        reply.raw.write(
          `event: end\ndata: ${JSON.stringify({
            status: cur.status,
            final_summary: derived.final_summary,
            final_source: derived.final_source,
            current_url: derived.current_url,
          })}\n\n`,
        );
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    req.raw.on("close", () => clearInterval(interval));
  });
};
