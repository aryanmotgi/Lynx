import type { FastifyPluginAsync } from "fastify";
import { DispatchRequest, createRun, enqueueRun } from "@lynx/shared";
import { dailySpend } from "@lynx/budget";

export const dispatchRoutes: FastifyPluginAsync = async (app) => {
  app.post("/dispatch", async (req, reply) => {
    const parsed = DispatchRequest.safeParse({
      ...(req.body as object),
      company_id: req.company_id,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const cap = process.env.DAILY_BUDGET_USD ? Number(process.env.DAILY_BUDGET_USD) : null;
    if (cap !== null) {
      const used = await dailySpend(parsed.data.company_id);
      if (used >= cap) {
        return reply.code(429).send({ error: "daily budget exceeded", used, cap });
      }
    }
    const run = await createRun({
      company_id: parsed.data.company_id,
      identity_id: parsed.data.identity_id,
      goal: parsed.data.goal,
      start_url: parsed.data.start_url,
    });
    await enqueueRun(parsed.data.company_id, run.id);
    return reply.code(202).send({
      run_id: run.id,
      status: run.status,
      status_url: `/v1/runs/${run.id}`,
      stream_url: `/v1/runs/${run.id}/stream`,
    });
  });
};
