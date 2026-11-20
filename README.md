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

| Método | Rota                  | Descrição                                     |
| ------ | --------------------- | --------------------------------------------- |
| POST   | `/pedidos`            | Cria um pedido com um ou mais itens           |
| GET    | `/pedidos`            | Lista todos os pedidos com status e ingressos |
| POST   | `/webhooks/pagamento` | Recebe o aviso de pagamento do provedor       |

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

## Testando as rotas manualmente

O arquivo [`request.http`](./request.http) na raiz do projeto tem requisições prontas para todas as rotas, incluindo os três cenários de webhook (pago, recusado, estornado) e casos de erro/borda (transição inválida, pedido inexistente, payload inválido, reenvio idempotente).

Para usar:

1. Suba a API (`npm run dev`).
2. Abra `request.http` no editor com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) (VS Code) ou equivalente (ex.: plugin HTTP Client do JetBrains).
3. Rode a requisição `POST /pedidos` e copie o `id` retornado.
4. Cole esse id no lugar de `PEDIDO_ID_AQUI` nas requisições de webhook que quiser testar, e rode-as na ordem desejada (ex.: `pago` antes de `estornado`, já que o estorno só é uma transição válida a partir de um pedido pago).

Cada requisição no arquivo tem um comentário `###` explicando o cenário.

## Decisões e motivos

- **Fastify em vez de Next.js**: o problema é uma API pura, sem necessidade de páginas/app router. Next.js adicionaria build/tooling sem benefício aqui. Fastify foi escolhido entre as opções de Node por ter validação de schema e testes HTTP (`app.inject()`) nativos, sem subir um servidor real para testar, além de ser uma opção com menor tempo de overhead que o Express.

- **Webhook sempre responde 200 ao provedor e sempre persiste o body recebido**: a tabela `WebhookEvent` guarda **todo** webhook recebido (válido ou não, pedido existente ou não), com o body bruto em `payload`. O fluxo é: (1) salva o evento recebido, (2) tenta processá-lo, (3) sempre responde `200`. Como, na minha experiência, o provedor interrompe o envio de webhooks caso receba erro na resposta da requisição após `n` tentativas, isso evita a interrupção da comunicação com o provedor e a auditoria de bugs/webhooks via log. A única exceção é um body que não é JSON válido, que o próprio Fastify rejeita com `400` antes de chegar ao handler.

- **Sem repository pattern**: a aplicação é pequena o suficiente para que o acesso a dados fique direto nos _services_ (`src/services/*`) via Prisma Client, sem uma camada de repositório adicional — evita abstração sem ganho real de testabilidade/flexibilidade neste tamanho de projeto.

- **Idempotência sem `@unique` no `eventoId`**: por pedido explícito, `WebhookEvent.eventoId` não tem constraint de unicidade no banco — a tabela é um log de chamadas, não um mecanismo de deduplicação via schema. A idempotência é verificada em nível de aplicação: antes de aplicar o efeito de um evento, o serviço consulta se já existe outro `WebhookEvent` com o mesmo `eventoId` e `processed: true`; se sim, o reenvio é ignorado (sem duplicar ingressos), mas ainda é registrado como uma nova linha na tabela.

- **Transições de status permitidas**: `aguardando_pagamento → pago`, `aguardando_pagamento → recusado`, `pago → estornado`. Qualquer outra combinação (ex.: `estornado → pago`, `recusado → pago`) é ignorada silenciosamente — o pedido não muda de estado, e isso é apenas logado. Essa é a única interpretação razoável do enunciado, que não descreve o que fazer com transições fora desse fluxo.

- **Case-insensitive nos valores de status**: o enunciado permite enviar status em maiúsculas ou minúsculas. O `status` do webhook é normalizado para minúsculo antes de ser comparado/persistido no `Pedido`/`Ingresso`; as respostas da API sempre devolvem os valores em minúsculo.

## O que faria diferente com mais tempo

- Mais importante: criaria uma instância de worker para processar os webhooks. Como os provedores (do webhook) em geral acusam falha no recebimento do webhook caso a resposta demore um tempo pré-determinado a chegar, essa requisição deve ser respondida com rapidez, de forma a evitar a interrupção da comunicação. Nesse caso, a rota `/webhooks/pagamento` receberia o webhook, criaria um registro dele no banco de dados, delegaria o processamento dele para um job a ser processado de forma assíncrona no worker e responderia a requisição com status 200;
- Adicionaria um linter e formatador de código (como o Prettier) para padronização do código do projeto;
- Escolheria um padrão específico para `id` no banco de dados (como o UUID v7);

## Tempo levado

Aproximadamente 2h30min, entre criar o repositório, planejar a stack e padrões do projeto, codificação e revisão.

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
