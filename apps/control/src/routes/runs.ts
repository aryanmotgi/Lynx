import type { FastifyPluginAsync } from "fastify";
import { bbSelect, getRun } from "@lynx/shared";

interface ActionRow {
  idx: number;
  type: string;
  payload_json: Record<string, unknown>;
  ts: string;
}

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const run = await getRun(req.company_id, req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
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
        reply.raw.write(`event: end\ndata: ${JSON.stringify({ status: cur.status })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    req.raw.on("close", () => clearInterval(interval));
  });
};
