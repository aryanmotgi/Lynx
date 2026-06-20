import type { FastifyPluginAsync } from "fastify";
import { getPlaybook, upsertPlaybook } from "@lynx/playbook-store";
import type { Playbook } from "@lynx/shared";

export const playbookRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { domain: string } }>("/playbooks", async (req, reply) => {
    if (!req.query.domain) return reply.code(400).send({ error: "domain required" });
    const pb = await getPlaybook(req.company_id, req.query.domain);
    if (!pb) return reply.code(404).send({ error: "playbook not found" });
    return pb;
  });

  app.post("/playbooks", async (req, reply) => {
    const body = req.body as Partial<Playbook>;
    if (!body.domain || !body.steps) {
      return reply.code(400).send({ error: "domain and steps required" });
    }
    const created = await upsertPlaybook({
      company_id: req.company_id,
      domain: body.domain,
      version: 0,
      steps: body.steps,
      success_rate: body.success_rate ?? 0,
    });
    return reply.code(201).send(created);
  });
};
