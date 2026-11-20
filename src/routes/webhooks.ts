import type { FastifyInstance } from "fastify";
import { processarWebhook } from "../services/webhookService";

export async function webhooksRoutes(app: FastifyInstance) {
  app.post("/webhooks/pagamento", async (request, reply) => {
    await processarWebhook(request.body, request.log);
    return reply.status(200).send({ recebido: true });
  });
}
