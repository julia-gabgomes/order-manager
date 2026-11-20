import { z } from "zod";
import { WEBHOOK_STATUS } from "../types/status";

/**
 * Validação de FORMA do payload (usada só depois de já termos persistido o
 * body bruto em WebhookEvent). Não impede o armazenamento do evento.
 */
export const webhookBodySchema = z.object({
  eventoId: z.string().trim().min(1),
  pedidoId: z.string().trim().min(1),
  status: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.toLowerCase())
    .pipe(z.enum([WEBHOOK_STATUS.PAGO, WEBHOOK_STATUS.RECUSADO, WEBHOOK_STATUS.ESTORNADO])),
});

export type WebhookBody = z.infer<typeof webhookBodySchema>;

/** Schema permissivo só para aceitar qualquer body no fastify (sem rejeitar antes de armazenar). */
export const webhookRawBodySchema = z.record(z.unknown());
