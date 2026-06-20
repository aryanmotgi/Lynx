import type { FastifyPluginAsync } from "fastify";
import { db, getRun } from "@lynx/shared";

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const run = await getRun(req.company_id, req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
  });

  // SSE stream — polls actions table for new rows. Real impl uses LISTEN/NOTIFY.
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
      const r = await db().query(
        `select idx, type, payload_json as payload, ts from actions
         where run_id = $1 and idx > $2 order by idx asc`,
        [req.params.id, lastIdx],
      );
      for (const row of r.rows) {
        lastIdx = row.idx;
        reply.raw.write(`data: ${JSON.stringify(row)}\n\n`);
      }
      const r2 = await db().query(`select status from runs where id = $1`, [req.params.id]);
      const status = r2.rows[0]?.status;
      if (status === "succeeded" || status === "failed" || status === "cancelled") {
        reply.raw.write(`event: end\ndata: ${JSON.stringify({ status })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    req.raw.on("close", () => clearInterval(interval));
  });
};
