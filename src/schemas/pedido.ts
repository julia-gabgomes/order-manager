import { z } from "zod";

export const criarPedidoBodySchema = z.object({
  itens: z
    .array(
      z.object({
        evento: z.string().trim().min(1, "evento é obrigatório"),
        quantidade: z.number().int().positive("quantidade deve ser maior que zero"),
      }),
    )
    .min(1, "o pedido precisa de ao menos um item"),
});

export type CriarPedidoBody = z.infer<typeof criarPedidoBodySchema>;

const ingressoSchema = z.object({
  id: z.string(),
  status: z.string(),
});

const itemPedidoSchema = z.object({
  id: z.string(),
  evento: z.string(),
  quantidade: z.number(),
});

export const pedidoResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  itens: z.array(itemPedidoSchema),
  ingressos: z.array(ingressoSchema),
});

export const listarPedidosResponseSchema = z.array(pedidoResponseSchema);
