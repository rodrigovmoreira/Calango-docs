# Implementar o fluxo de checkout do Calango Food integrado ao Squamata-gateway

> **Este arquivo é temporário.** Um spec por *iniciativa*, não por etapa: as fases moram aqui dentro.
> Ao concluir a execução, o valor durável migra — decisão para **ADR**, o que falta para o **roadmap**,
> o que foi feito e as armadilhas para o **`MEMORY.md`** — e o spec pode ser apagado.
> Não crie um spec novo por fase. Ver [`ai-rules.md`](../spec/ai-rules.md) §4, itens 3 e 5.

<!--
  TÍTULO E OBJETIVO DA TAREFA
  ---------------------------
  Descreva em poucas linhas O QUE será feito e POR QUÊ.
  Ex.: "Implementar o fluxo de checkout do Calango Food integrado ao Squamata-gateway."
-->

Permitir que o cliente finalize o pedido no Calango Food com pagamento processado pelo Squamata-gateway, garantindo isolamento multi-tenant (`appSlug`/`tenantId`) e idempotência na criação do pedido.

## Dependências

<!--
  O QUE ADICIONAR / REMOVER
  -------------------------
  - Pacotes/bibliotecas a instalar ou remover (com versão, se relevante).
  - Serviços do ecossistema consumidos (Squamata-login, Squamata-upload, etc.).
  - Novos containers, recursos de infraestrutura ou redes (squamata-global).
-->

- **Pacotes:** `axios@^1.7.0` (chamadas HTTP ao gateway), `zod@^3.23.0` (validação de payload).
- **Serviços do ecossistema:**
  - `Squamata-login` (SSO) — validação do JWT e extração de `appSlug`/`tenantId`.
  - `Squamata-gateway` — criação e confirmação da cobrança.
- **Infraestrutura:** nenhum container novo; reutilizar a rede externa `squamata-global`.

## Variáveis de Ambiente Necessárias

<!--
  Liste as variáveis obrigatórias e opcionais do .env, com descrição.
  Lembre-se: segredos NUNCA em hardcode — sempre via variáveis de ambiente.
  Ex.:
  - MONGO_URI: string de conexão com o MongoDB central (porta 27018).
  - APP_SLUG: identificador de isolamento multi-tenant.
-->

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `MONGO_URI` | Sim | String de conexão com o MongoDB central (porta `27018`). |
| `APP_SLUG` | Sim | Identificador de isolamento multi-tenant (ex.: `calango-food`). |
| `JWT_SECRET` | Sim | Segredo para validação dos tokens emitidos pelo Squamata-login. |
| `GATEWAY_BASE_URL` | Sim | URL base do Squamata-gateway (ex.: `http://squamata-gateway:3006`). |
| `GATEWAY_API_KEY` | Sim | Chave de autenticação serviço-a-serviço com o gateway. |
| `CHECKOUT_TIMEOUT_MS` | Não | Timeout das chamadas ao gateway (padrão: `5000`). |

## Regras de Implementação

<!--
  Restrições e orientações obrigatórias (consulte a constitution.md):
  - Design sem estado (Statelessness).
  - Idempotência nas rotas que alteram dados.
  - Observabilidade: logs com serviço de origem + appSlug/tenantId.
  - Degradação graciosa para serviços satélites.
  - Segredos apenas via variáveis de ambiente (nunca hardcode).
-->

- **Statelessness:** nenhum estado de carrinho/sessão em memória; persistir no MongoDB.
- **Idempotência:** `POST /checkout` deve aceitar `Idempotency-Key` e não duplicar pedidos com o mesmo payload.
- **Multi-tenancy:** toda rota valida `appSlug` e `tenantId` do JWT antes de qualquer operação.
- **Degradação graciosa:** se o gateway falhar, registrar o erro no log e manter o pedido em `pending_payment` (não derrubar o fluxo).
- **Observabilidade:** logs de erro com serviço de origem, operação e `appSlug`/`tenantId`.
- **Segredos:** apenas via `process.env` — nunca em hardcode.
- **Fail Fast:** ausência de variável obrigatória deve quebrar o boot do serviço.

## Arquivos Afetados no Repositório

<!--
  Liste os arquivos que serão criados, alterados ou removidos.
  Ex.:
  - src/services/checkout.service.js (novo)
  - .env.example (atualizar)
-->

- `src/services/checkout.service.js` (novo)
- `src/controllers/CheckoutController.js` (novo)
- `src/routes/checkoutRoutes.js` (novo)
- `src/models/Order.js` (alterar — adicionar campos `paymentStatus` e `idempotencyKey`)
- `.env.example` (atualizar)
- `docs/spec/checkout.md` (novo)

## Critérios de Aceite (Checklist)

<!--
  Marque todos os itens para considerar a tarefa concluída.
-->

- [ ] `POST /checkout` cria o pedido e retorna `201` com o `orderId`.
- [ ] Requisições repetidas com a mesma `Idempotency-Key` não duplicam pedidos.
- [ ] Rotas rejeitam requisições sem `appSlug`/`tenantId` válidos com HTTP `403`.
- [ ] Falha do Squamata-gateway não derruba o fluxo; pedido fica em `pending_payment`.
- [ ] Logs de erro contêm serviço de origem, operação e `appSlug`/`tenantId`.
- [ ] Nenhum segredo em hardcode; todas as credenciais vêm de variáveis de ambiente.
