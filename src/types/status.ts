export const PEDIDO_STATUS = {
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  PAGO: "pago",
  RECUSADO: "recusado",
  ESTORNADO: "estornado",
} as const;

export type PedidoStatus = (typeof PEDIDO_STATUS)[keyof typeof PEDIDO_STATUS];

export const INGRESSO_STATUS = {
  ATIVO: "ativo",
  CANCELADO: "cancelado",
} as const;

export type IngressoStatus = (typeof INGRESSO_STATUS)[keyof typeof INGRESSO_STATUS];

export const WEBHOOK_STATUS = {
  PAGO: "pago",
  RECUSADO: "recusado",
  ESTORNADO: "estornado",
} as const;

export type WebhookStatus = (typeof WEBHOOK_STATUS)[keyof typeof WEBHOOK_STATUS];

/**
 * Transições de status de pedido permitidas pelo webhook do provedor.
 * Qualquer transição fora deste mapa é ignorada silenciosamente.
 */
export const ALLOWED_TRANSITIONS: Record<PedidoStatus, WebhookStatus[]> = {
  [PEDIDO_STATUS.AGUARDANDO_PAGAMENTO]: [WEBHOOK_STATUS.PAGO, WEBHOOK_STATUS.RECUSADO],
  [PEDIDO_STATUS.PAGO]: [WEBHOOK_STATUS.ESTORNADO],
  [PEDIDO_STATUS.RECUSADO]: [],
  [PEDIDO_STATUS.ESTORNADO]: [],
};
