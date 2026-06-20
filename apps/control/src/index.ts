import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { authPlugin } from "./auth-plugin";
import { dispatchRoutes } from "./routes/dispatch";
import { runRoutes } from "./routes/runs";
import { playbookRoutes } from "./routes/playbooks";
import { identityRoutes } from "./routes/identities";

export async function build() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(sensible);
  await app.register(authPlugin);

  app.get("/health", async () => ({ ok: true, version: "0.0.1" }));

  await app.register(dispatchRoutes, { prefix: "/v1" });
  await app.register(runRoutes, { prefix: "/v1" });
  await app.register(playbookRoutes, { prefix: "/v1" });
  await app.register(identityRoutes, { prefix: "/v1" });

  return app;
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

build().then(async (app) => {
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
});
