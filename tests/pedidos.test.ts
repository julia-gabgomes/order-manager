import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("POST /pedidos", () => {
  it("cria um pedido com múltiplos itens e status inicial aguardando_pagamento", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/pedidos",
      payload: {
        itens: [
          { evento: "Imersão A", quantidade: 3 },
          { evento: "Imersão B", quantidade: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeTypeOf("string");
    expect(body.status).toBe("aguardando_pagamento");
    expect(body.itens).toHaveLength(2);
    expect(body.ingressos).toHaveLength(0);

    await app.close();
  });

  it("rejeita payload sem itens", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/pedidos",
      payload: { itens: [] },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("rejeita item com quantidade inválida", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/pedidos",
      payload: { itens: [{ evento: "Imersão A", quantidade: 0 }] },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

describe("GET /pedidos", () => {
  it("lista pedidos com status e ingressos", async () => {
    const app = buildApp();

    await app.inject({
      method: "POST",
      url: "/pedidos",
      payload: { itens: [{ evento: "Imersão A", quantidade: 2 }] },
    });

    const response = await app.inject({ method: "GET", url: "/pedidos" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("status");
    expect(body[0]).toHaveProperty("ingressos");

    await app.close();
  });
});
