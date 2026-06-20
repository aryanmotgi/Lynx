import type { FastifyPluginAsync } from "fastify";
import { createIdentity, listIdentities } from "@lynx/identity-vault";

export const identityRoutes: FastifyPluginAsync = async (app) => {
  app.get("/identities", async (req) => {
    return listIdentities(req.company_id);
  });

  app.post("/identities", async (req, reply) => {
    const body = req.body as {
      label: string;
      email?: string;
      phone?: string;
      payment_token?: string;
      fingerprint?: Record<string, unknown>;
    };
    if (!body.label) return reply.code(400).send({ error: "label required" });
    const id = await createIdentity({ company_id: req.company_id, ...body });
    return reply.code(201).send(id);
  });
};
