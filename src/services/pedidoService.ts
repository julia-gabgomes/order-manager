import { prisma } from "../lib/prisma";
import type { CriarPedidoBody } from "../schemas/pedido";
import { PEDIDO_STATUS } from "../types/status";

export async function criarPedido(body: CriarPedidoBody) {
  return prisma.pedido.create({
    data: {
      status: PEDIDO_STATUS.AGUARDANDO_PAGAMENTO,
      itens: {
        create: body.itens.map((item) => ({
          evento: item.evento,
          quantidade: item.quantidade,
        })),
      },
    },
    include: {
      itens: true,
      ingressos: true,
    },
  });
}

export async function listarPedidos() {
  return prisma.pedido.findMany({
    include: {
      itens: true,
      ingressos: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
