import { prisma } from "../lib/prisma";
import { webhookBodySchema } from "../schemas/webhook";
import { ALLOWED_TRANSITIONS, INGRESSO_STATUS, PEDIDO_STATUS, type PedidoStatus, type WebhookStatus } from "../types/status";

type Logger = Pick<Console, "warn" | "info">;

function extrairCampoBruto(body: unknown, campo: string): string {
  if (typeof body === "object" && body !== null && campo in body) {
    const valor = (body as Record<string, unknown>)[campo];
    return typeof valor === "string" ? valor : String(valor ?? "");
  }
  return "";
}

/**
 * Processa um webhook de pagamento. Sempre:
 * 1) persiste o body bruto recebido em WebhookEvent (mesmo que inválido/pedido inexistente),
 * 2) tenta aplicar o efeito de negócio correspondente,
 * 3) nunca lança erro para o caller — o handler HTTP sempre responde 200 ao provedor.
 */
export async function processarWebhook(rawBody: unknown, logger: Logger = console): Promise<void> {
  const eventoId = extrairCampoBruto(rawBody, "eventoId");
  const pedidoId = extrairCampoBruto(rawBody, "pedidoId");
  const statusBruto = extrairCampoBruto(rawBody, "status");

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      eventoId,
      pedidoId,
      status: statusBruto,
      payload: JSON.stringify(rawBody ?? null),
      processed: false,
    },
  });

  const parsed = webhookBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn(`[webhook] payload inválido, ignorado: ${JSON.stringify(parsed.error.flatten())}`);
    return;
  }

  const { status } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({
      where: { id: parsed.data.pedidoId },
      include: { itens: true },
    });

    if (!pedido) {
      logger.warn(`[webhook] pedido ${parsed.data.pedidoId} não encontrado, evento ${eventoId} ignorado`);
      return;
    }

    const jaProcessado = await tx.webhookEvent.findFirst({
      where: {
        eventoId: parsed.data.eventoId,
        processed: true,
        id: { not: webhookEvent.id },
      },
    });

    if (jaProcessado) {
      logger.info(`[webhook] eventoId ${eventoId} já processado anteriormente, ignorando reenvio`);
      return;
    }

    const transicoesPermitidas = ALLOWED_TRANSITIONS[pedido.status as PedidoStatus] ?? [];
    if (!transicoesPermitidas.includes(status as WebhookStatus)) {
      logger.warn(`[webhook] transição ${pedido.status} -> ${status} não permitida para pedido ${pedido.id}, ignorada`);
      return;
    }

    if (status === PEDIDO_STATUS.PAGO) {
      for (const item of pedido.itens) {
        await tx.ingresso.createMany({
          data: Array.from({ length: item.quantidade }, () => ({
            pedidoId: pedido.id,
            itemPedidoId: item.id,
            status: INGRESSO_STATUS.ATIVO,
          })),
        });
      }
    } else if (status === PEDIDO_STATUS.ESTORNADO) {
      await tx.ingresso.updateMany({
        where: { pedidoId: pedido.id },
        data: { status: INGRESSO_STATUS.CANCELADO },
      });
    }

    await tx.pedido.update({
      where: { id: pedido.id },
      data: { status },
    });

    await tx.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processed: true },
    });
  });
}
