import type { FastifyInstance } from "fastify";
import { criarPedidoBodySchema } from "../schemas/pedido";
import { criarPedido, listarPedidos } from "../services/pedidoService";

export async function pedidosRoutes(app: FastifyInstance) {
  app.post("/pedidos", async (request, reply) => {
    const parsed = criarPedidoBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ erro: "payload inválido", detalhes: parsed.error.flatten() });
    }

    const pedido = await criarPedido(parsed.data);
    return reply.status(201).send(pedido);
  });

  app.get("/pedidos", async (_request, reply) => {
    const pedidos = await listarPedidos();
    return reply.status(200).send(pedidos);
  });
}
