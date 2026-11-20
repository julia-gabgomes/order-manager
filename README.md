# order-manager

API de pedidos de ingressos para eventos: cria pedidos, recebe o webhook de pagamento de um provedor externo e controla a emissão/cancelamento de ingressos.

## Stack

- Node.js + TypeScript
- [Fastify](https://fastify.dev/) (API HTTP)
- [Prisma](https://www.prisma.io/) + SQLite (persistência)
- [Zod](https://zod.dev/) (validação de payloads)
- [Vitest](https://vitest.dev/) (testes)

## Como rodar do zero (máquina limpa)

Requisitos: Node.js 20+ (usa a flag nativa `--env-file`) e npm.

```bash
# 1. instalar dependências
npm install

# 2. copiar o .env de exemplo
cp .env.example .env

# 3. gerar o client do Prisma e criar o banco SQLite de desenvolvimento
npx prisma generate
npx prisma db push

# 4. subir a API em modo desenvolvimento (watch)
npm run dev
```

A API sobe em **http://localhost:3000**, **sem prefixo `/api`** — as rotas são exatamente `/pedidos` e `/webhooks/pagamento`, como pedido no enunciado. A porta pode ser trocada via variável de ambiente `PORT`.

Para rodar em modo "produção" local (sem watch): `npm start`.

### Rodando os testes

Os testes usam um banco SQLite próprio (`prisma/test.db`), criado e descartado automaticamente — não é preciso configurar nada além de `npm install`:

```bash
npm test
```

Cada arquivo de teste limpa as tabelas antes de cada caso (`tests/setup.ts`) e o banco de teste é recriado do schema atual a cada execução (`tests/globalSetup.ts`), então os testes são isolados entre si e da sua base de desenvolvimento.

### Checagem de tipos

```bash
npm run typecheck
```

## Rotas

| Método | Rota                      | Descrição                                   |
| ------ | ------------------------- | -------------------------------------------- |
| POST   | `/pedidos`                | Cria um pedido com um ou mais itens          |
| GET    | `/pedidos`                | Lista todos os pedidos com status e ingressos |
| POST   | `/webhooks/pagamento`     | Recebe o aviso de pagamento do provedor      |

### `POST /pedidos`

```json
{
  "itens": [
    { "evento": "Imersão A", "quantidade": 3 },
    { "evento": "Imersão B", "quantidade": 1 }
  ]
}
```

Responde `201` com o pedido criado (status inicial `aguardando_pagamento`, sem ingressos ainda). `400` se `itens` estiver vazio ou algum item tiver `quantidade <= 0` / `evento` vazio.

### `GET /pedidos`

Responde `200` com a lista de pedidos, cada um com `id`, `status` e `ingressos: [{ id, status }]` (além de outros campos como `itens`, `createdAt`).

### `POST /webhooks/pagamento`

```json
{
  "eventoId": "evt_8f2a1c",
  "pedidoId": "<id do pedido>",
  "status": "pago"
}
```

`status` aceita `pago`, `recusado` ou `estornado` (maiúsculas/minúsculas, ver decisões abaixo). Sempre responde `200` ao provedor (ver "Decisões e ambiguidades").

## Decisões e ambiguidades

O enunciado permitia Next.js ou Node puro, e deixava algumas regras implícitas. Decisões tomadas e motivos:

- **Fastify em vez de Next.js**: o problema é uma API pura, sem necessidade de páginas/app router. Next.js adicionaria build/tooling sem benefício aqui, e o enunciado permitia Node puro. Fastify foi escolhido entre as opções de Node por ter validação de schema e testes HTTP (`app.inject()`) nativos, sem subir um servidor real para testar.

- **Webhook sempre responde 200 ao provedor e sempre persiste o body recebido**: a tabela `WebhookEvent` guarda **todo** webhook recebido (válido ou não, pedido existente ou não), com o body bruto em `payload`. O fluxo é: (1) salva o evento recebido, (2) tenta processá-lo, (3) sempre responde `200`. Isso evita que o provedor fique reenviando o webhook por erro de negócio do nosso lado (pedido inexistente, transição inválida, reenvio duplicado) — esses casos são apenas logados internamente, nunca retornam erro HTTP. A única exceção é um body que não é JSON válido, que o próprio Fastify rejeita com `400` antes de chegar ao handler.

- **Idempotência sem `@unique` no `eventoId`**: por pedido explícito, `WebhookEvent.eventoId` não tem constraint de unicidade no banco — a tabela é um log de chamadas, não um mecanismo de deduplicação via schema. A idempotência é verificada em nível de aplicação: antes de aplicar o efeito de um evento, o serviço consulta se já existe outro `WebhookEvent` com o mesmo `eventoId` e `processed: true`; se sim, o reenvio é ignorado (sem duplicar ingressos), mas ainda é registrado como uma nova linha na tabela.

- **Transições de status permitidas**: `aguardando_pagamento → pago`, `aguardando_pagamento → recusado`, `pago → estornado`. Qualquer outra combinação (ex.: `estornado → pago`, `recusado → pago`) é ignorada silenciosamente — o pedido não muda de estado, e isso é apenas logado. Essa é a única interpretação razoável do enunciado, que não descreve o que fazer com transições fora desse fluxo.

- **Case-insensitive nos valores de status**: o enunciado permite enviar status em maiúsculas ou minúsculas. O `status` do webhook é normalizado para minúsculo antes de ser comparado/persistido no `Pedido`/`Ingresso`; as respostas da API sempre devolvem os valores em minúsculo.

- **Enums armazenados como `String`, não `enum` do Prisma**: o conector SQLite do Prisma não suporta o tipo `enum` nativo. Os valores válidos (`aguardando_pagamento`, `pago`, `recusado`, `estornado`, `ativo`, `cancelado`) são garantidos pela camada de aplicação (Zod + constantes TypeScript em `src/types/status.ts`), não pelo schema do banco.

- **Sem repository pattern**: a aplicação é pequena o suficiente para que o acesso a dados fique direto nos *services* (`src/services/*`) via Prisma Client, sem uma camada de repositório adicional — evita abstração sem ganho real de testabilidade/flexibilidade neste tamanho de projeto.

- **1 ingresso por unidade comprada**: ao pagar um pedido, cada item gera `quantidade` linhas em `Ingresso`, cada uma vinculada ao item de origem (`itemPedidoId`) e ao pedido.

- **`WebhookEvent.pedidoId` sem foreign key**: como o evento deve ser salvo mesmo quando o `pedidoId` recebido não corresponde a nenhum pedido existente, esse campo é uma string livre, sem `@relation` obrigatória — uma FK rígida impediria a gravação do log nesse cenário.

## Estrutura de pastas

```
src/
  app.ts              # monta a instância Fastify (usada tanto pelo server quanto pelos testes)
  server.ts           # ponto de entrada, faz o listen()
  lib/prisma.ts        # client Prisma singleton
  routes/              # handlers HTTP (pedidos, webhooks)
  services/            # regras de negócio (criar/listar pedido, processar webhook)
  schemas/             # validação Zod de entrada/saída
  types/status.ts      # constantes de status e matriz de transições permitidas
prisma/schema.prisma    # modelo de dados
tests/                  # testes de integração (via app.inject()) e unitários
```
