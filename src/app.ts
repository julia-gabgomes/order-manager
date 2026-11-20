import Fastify from "fastify";
import { pedidosRoutes } from "./routes/pedidos";
import { webhooksRoutes } from "./routes/webhooks";

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.register(pedidosRoutes);
  app.register(webhooksRoutes);

  app.get("/", async (_request, reply) => reply.status(200).send({ status: "ok" }));

  return app;
}
