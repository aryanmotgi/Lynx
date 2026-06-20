import type { FastifyPluginAsync } from "fastify";
import { DispatchRequest, createRun } from "@lynx/shared";

export const dispatchRoutes: FastifyPluginAsync = async (app) => {
  app.post("/dispatch", async (req, reply) => {
    const parsed = DispatchRequest.safeParse({
      ...(req.body as object),
      company_id: req.company_id,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const run = await createRun({
      company_id: parsed.data.company_id,
      identity_id: parsed.data.identity_id,
      goal: parsed.data.goal,
      start_url: parsed.data.start_url,
    });
    return reply.code(202).send({
      run_id: run.id,
      status: run.status,
      status_url: `/v1/runs/${run.id}`,
      stream_url: `/v1/runs/${run.id}/stream`,
    });
  });
};
