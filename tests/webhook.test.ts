import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

async function criarPedido(app: ReturnType<typeof buildApp>, itens: { evento: string; quantidade: number }[]) {
  const response = await app.inject({ method: "POST", url: "/pedidos", payload: { itens } });
  return response.json();
}

describe("POST /webhooks/pagamento", () => {
  it("gera um ingresso por unidade comprada quando o pedido é pago", async () => {
    const app = buildApp();
    const pedido = await criarPedido(app, [
      { evento: "Imersão A", quantidade: 3 },
      { evento: "Imersão B", quantidade: 1 },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_1", pedidoId: pedido.id, status: "pago" },
    });

    expect(response.statusCode).toBe(200);

    const atualizado = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { ingressos: true },
    });

    expect(atualizado?.status).toBe("pago");
    expect(atualizado?.ingressos).toHaveLength(4);
    expect(atualizado?.ingressos.every((i) => i.status === "ativo")).toBe(true);

    await app.close();
  });

  it("cancela todos os ingressos quando o pedido pago é estornado", async () => {
    const app = buildApp();
    const pedido = await criarPedido(app, [{ evento: "Imersão A", quantidade: 2 }]);

    await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_2", pedidoId: pedido.id, status: "pago" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_3", pedidoId: pedido.id, status: "estornado" },
    });

    expect(response.statusCode).toBe(200);

    const atualizado = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { ingressos: true },
    });

    expect(atualizado?.status).toBe("estornado");
    expect(atualizado?.ingressos.every((i) => i.status === "cancelado")).toBe(true);

    await app.close();
  });

  it("marca o pedido como recusado sem gerar ingressos", async () => {
    const app = buildApp();
    const pedido = await criarPedido(app, [{ evento: "Imersão A", quantidade: 2 }]);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_4", pedidoId: pedido.id, status: "recusado" },
    });

    expect(response.statusCode).toBe(200);

    const atualizado = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { ingressos: true },
    });

    expect(atualizado?.status).toBe("recusado");
    expect(atualizado?.ingressos).toHaveLength(0);

    await app.close();
  });

  it("ignora reenvio com o mesmo eventoId já processado (não duplica ingressos)", async () => {
    const app = buildApp();
    const pedido = await criarPedido(app, [{ evento: "Imersão A", quantidade: 2 }]);

    const payload = { eventoId: "evt_5", pedidoId: pedido.id, status: "pago" };

    await app.inject({ method: "POST", url: "/webhooks/pagamento", payload });
    const segunda = await app.inject({ method: "POST", url: "/webhooks/pagamento", payload });

    expect(segunda.statusCode).toBe(200);

    const atualizado = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { ingressos: true },
    });

    expect(atualizado?.ingressos).toHaveLength(2);

    await app.close();
  });

  it("ignora transição inválida (estornado -> pago) sem alterar o pedido", async () => {
    const app = buildApp();
    const pedido = await criarPedido(app, [{ evento: "Imersão A", quantidade: 1 }]);

    await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_6", pedidoId: pedido.id, status: "pago" },
    });
    await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_7", pedidoId: pedido.id, status: "estornado" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_8", pedidoId: pedido.id, status: "pago" },
    });

    expect(response.statusCode).toBe(200);

    const atualizado = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { ingressos: true },
    });

    expect(atualizado?.status).toBe("estornado");
    expect(atualizado?.ingressos.every((i) => i.status === "cancelado")).toBe(true);

    await app.close();
  });

  it("responde 200 e armazena o evento mesmo para pedidoId inexistente", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_9", pedidoId: "pedido-inexistente", status: "pago" },
    });

    expect(response.statusCode).toBe(200);

    const evento = await prisma.webhookEvent.findFirst({ where: { eventoId: "evt_9" } });
    expect(evento).not.toBeNull();
    expect(evento?.processed).toBe(false);

    await app.close();
  });

  it("normaliza o status do webhook (case-insensitive)", async () => {
    const app = buildApp();
    const pedido = await criarPedido(app, [{ evento: "Imersão A", quantidade: 1 }]);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_10", pedidoId: pedido.id, status: "PAGO" },
    });

    expect(response.statusCode).toBe(200);

    const atualizado = await prisma.pedido.findUnique({ where: { id: pedido.id } });
    expect(atualizado?.status).toBe("pago");

    await app.close();
  });

  it("armazena o body bruto de todo webhook recebido, válido ou não", async () => {
    const app = buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      payload: { eventoId: "evt_11", pedidoId: "qualquer", status: "status_invalido" },
    });

    const evento = await prisma.webhookEvent.findFirst({ where: { eventoId: "evt_11" } });
    expect(evento).not.toBeNull();
    expect(JSON.parse(evento!.payload)).toMatchObject({ eventoId: "evt_11", status: "status_invalido" });

    await app.close();
  });
});
