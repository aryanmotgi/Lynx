import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { companyByApiKey } from "@lynx/shared";

declare module "fastify" {
  interface FastifyRequest {
    company_id: string;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;

    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      reply.code(401).send({ error: "missing bearer api key" });
      return;
    }
    const key = header.slice("Bearer ".length).trim();
    const co = await companyByApiKey(key);
    if (!co) {
      reply.code(401).send({ error: "invalid api key" });
      return;
    }
    req.company_id = co.id;
  });
};

export const authPlugin = fp(plugin, { name: "lynx-auth" });
