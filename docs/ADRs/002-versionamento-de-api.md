# ADR 002 — Versionamento de API (prefixo `/api/v1`)

- **Status:** Aceito
- **Data:** 2026-10-28
- **Escopo:** Todos os serviços HTTP do ecossistema Calango/Squamata

---

## Contexto

Antes desta decisão, o ecossistema usava **cinco convenções diferentes** para expor as mesmas APIs:

| Serviço | Prefixo antes da decisão |
| --- | --- |
| Calango-Bot (backend) | `/api/<recurso>` |
| Calango-Food (backend) | `/api/<recurso>` |
| marianos-meat (backend) | `/api/<recurso>` |
| Squamata-Login | `/api/v1/auth` |
| Squamata-Gateway | `/v1/payments` (sem `/api`) |
| Squamata-Upload | `/generate-upload-url` (sem prefixo) |

O efeito prático era que qualquer integração precisava memorizar exceções por serviço. O caso mais visível: o roadmap de SSO documenta o healthcheck do login como `/api/v1/auth/health`, enquanto o restante do Calango-Bot respondia em `/api/auth/*`.

Também não existia regra escrita sobre **quando** quebrar contrato, o que significa que uma mudança incompatível poderia ser publicada sem que nenhum consumidor tivesse como se proteger.

## Decisão

1. **Adotar `/api/v{n}/<recurso>` como caminho canônico** para toda API HTTP do ecossistema, usando apenas o número *major* (`v1`, nunca `v1.0` ou `v1.4.2`). Mudanças incrementais e compatíveis são aplicadas **in place** dentro do mesmo major.
2. **Manter o prefixo `/api`** — ele funciona como namespace de roteamento para os frontends e o proxy reverso, e não é redundante neste ecossistema.
3. **Um caminho único por rota.** Não existe alias legado: cada recurso responde apenas em `/api/v1/...`. Ver "Revisão" abaixo — o alias duplo previsto na primeira versão desta decisão foi removido.
4. **Rotas de webhook de terceiros ficam fora do versionamento**, em namespace próprio (`/api/webhooks/...` ou caminho já cadastrado no provedor). A URL é configurada no painel do provedor e não pode mudar quando a API evoluir para `v2`.
5. **Healthcheck padronizado:** todo serviço expõe `GET /api/v1/health`, e apenas esse caminho.
6. **Exceção declarada:** `squamata-headless` (Payload CMS) mantém `/api/{collection}` por ser contrato do framework.

### Revisão (2026-10-28) — aliases removidos no mesmo dia

A versão inicial desta decisão previa **alias duplo** durante a transição: cada recurso responderia em `/api/<recurso>` (legado) e `/api/v1/<recurso>`, migrando clientes por interceptor e removendo o legado depois.

Isso foi **desfeito** porque o ecossistema ainda está em desenvolvimento e não possui clientes com uso real. Manter dois caminhos sem consumidor produzia apenas custo:

- tabela de rotas com o dobro de entradas, encobrindo a real superfície de ataque;
- risco de correção aplicada em um caminho e não no outro;
- `app.use` com array de paths, que no **Express 5** falha silenciosamente quando um caminho é prefixo do outro (`/api` × `/api/v1` → 404 no versionado);
- interceptor de rewrite no frontend, que fazia o `grep` mentir sobre qual caminho é usado de fato.

Estado final: **caminho canônico único**, caminhos declarados explicitamente no frontend, e probes de *ausência* no smoke test (esperam `404` no caminho antigo) para impedir que a duplicação volte.

> Se um dia houver clientes externos, a estratégia de alias duplo pode ser reativada para a transição — mas com prazo de remoção registrado e marcador greppável (`LEGACY_REMOVE`) no código.

### Mecanismo escolhido e alternativas descartadas

O versionamento é feito **no path**. Alternativas conhecidas e por que não foram adotadas:

| Mecanismo | Referência | Motivo da recusa |
| --- | --- | --- |
| Header (`X-Api-Version`) | GitHub REST, Stripe | Exige disciplina de cliente e é invisível em logs/proxies; sem SDK próprio, o ganho não paga |
| Query param (`?api-version=`) | Microsoft Azure | Polui toda URL e complica cache por path |
| Media type (`Accept: application/vnd.x.v1+json`) | Zalando | Mais elegante em teoria, porém ilegível para quem depura com `curl` e não é suportado por browser/navegação direta |

O path versioning é o que o Google usa (AIP-185) e é o mais simples de auditar em logs, `cloudflared` e healthchecks.

## Consequências

### Positivas

- Um único padrão previsível para todos os serviços.
- A opção de rodar `v1` e `v2` em paralelo no futuro sem rename global.
- Superfície de rota auditável: uma entrada por recurso, sem caminhos mortos.

### Negativas / custos assumidos

- Toda quebra de contrato exige caminho novo (`v2`) e convivência; não há atalho.
- Exige disciplina de declarar o caminho explicitamente em todo cliente — sem interceptor mágico.

## Regras de evolução do contrato

1. **Dentro de `v1`:** apenas mudanças aditivas — novos recursos, novos campos opcionais, novos valores de enum.
2. **Quebra de contrato:** exige novo major (`/api/v2`) e período de convivência com `v1`.
3. **Deprecação:** sinalizar com os headers `Deprecation` ([RFC 9745](https://www.rfc-editor.org/rfc/rfc9745.html)) e `Sunset` ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594.html)) e só remover após o prazo comunicado.
4. **Nunca reintroduzir alias não versionado.** O smoke test tem probes de ausência que falham se `/api/<recurso>` voltar a responder.

## Como criar um serviço ou rota nova

- **Backend:** montar **um único** caminho.
  ```js
  app.use('/api/v1/tags', tagRoutes);          // canônico
  app.get('/api/v1/health', healthHandler);    // obrigatório
  ```
  Não use array de paths (`['/api/x', '/api/v1/x']`): além de duplicar a rota, no **Express 5** ele falha quando um caminho é prefixo do outro.
- **Webhook de terceiro:** namespace próprio, fora do versionamento — ex. `app.use('/api/webhooks/payments', webhookRoutes)`.
- **Frontend axios:** declarar o caminho completo com versão (`api.get('/api/v1/tags')`). A `baseURL` aponta só para o host, normalizada por `normalizeApiBase` (`src/services/apiBase.js`), que remove sufixo `/api` ou `/api/vN` caso a variável de ambiente traga um.
- **Frontend com `fetch`:** mesma regra — base no host, caminho versionado explícito.

## Estado após esta decisão

| Serviço | Caminho canônico | Fora do versionamento |
| --- | --- | --- |
| Calango-Bot | `/api/v1/<recurso>` | `/api/webhook` (Twilio), `/api/meta/webhook` (Meta) |
| Calango-Food | `/api/v1/<recurso>` | — |
| marianos-meat | `/api/v1/<recurso>` | — |
| Squamata-Login | `/api/v1/auth`, `/api/v1/health` | — |
| Squamata-Gateway | `/api/v1/payments` | `/api/webhooks/payments/:provider` |
| Squamata-Upload | `/api/v1/upload/generate-upload-url` | — |
| Squamata-CEP | `/api/v1/health` | `/` (landing) |
| squamata-headless (Payload) | — | `/api/{collection}`, `/admin` (framework) |

Healthcheck: **apenas** `GET /api/v1/health` em todos os serviços.

## Referências

- Google API Improvement Proposal [AIP-185 — API Versioning](https://google.aip.dev/185)
- Microsoft Azure REST API Guidelines — `api-version` como parâmetro obrigatório
- GitHub REST — `/en/rest/about-the-rest-api/api-versions`
- Zalando RESTful API Guidelines — seção 16 (Compatibility)
- RFC 9745 (`Deprecation`), RFC 8594 (`Sunset`)
