import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { processarWebhook } from "../src/services/webhookService";

const noopLogger = { warn: vi.fn(), info: vi.fn() };

describe("processarWebhook (unitário)", () => {
  it("nunca lança erro, mesmo com body completamente fora do formato esperado", async () => {
    await expect(processarWebhook({ qualquerCoisa: true }, noopLogger)).resolves.toBeUndefined();
    await expect(processarWebhook(null, noopLogger)).resolves.toBeUndefined();
    await expect(processarWebhook("string solta", noopLogger)).resolves.toBeUndefined();
  });

  it("registra o evento mesmo quando o payload não é um objeto", async () => {
    await processarWebhook("payload-string", noopLogger);

    const evento = await prisma.webhookEvent.findFirst({ orderBy: { createdAt: "desc" } });
    expect(evento).not.toBeNull();
    expect(evento?.processed).toBe(false);
  });

  it("não aplica efeito quando o pedido referenciado não existe", async () => {
    await processarWebhook(
      { eventoId: "evt_unit_1", pedidoId: "nao-existe", status: "pago" },
      noopLogger,
    );

    const evento = await prisma.webhookEvent.findFirst({ where: { eventoId: "evt_unit_1" } });
    expect(evento?.processed).toBe(false);
  });
});
