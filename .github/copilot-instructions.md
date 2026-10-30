# Instruções Globais — Ecossistema Calango/Squamata

> Aplicam-se a **todo** trabalho neste repositório e aos serviços que ele governa.
> Norma completa: [constitution.md](./constitution.md) · Topologia: [Architecture.md](./Architecture.md) · Decisões: [docs/ADRs](./docs/ADRs).

---

## 1. Squamata-Login é dependência central — SPOF declarado

O `squamata-login` é o **único emissor de identidade** do ecossistema. Calango-Bot, Calango-Food, marianos-meat e qualquer app futuro **não** autenticam sozinhos: eles delegam ao Squamata-Login (SSO) e apenas **validam o JWT** que ele emitiu, usando o segredo compartilhado `JWT_SECRET_LOGIN`.

Sem o Squamata-Login no ar:

- **Nenhum login novo** acontece em nenhuma aplicação do ecossistema.
- Sessões já emitidas continuam válidas até o token expirar (a validação é local, por segredo compartilhado) — mas não há renovação nem novo acesso.
- Qualquer fluxo de callback/refresh/OAuth para de funcionar.

Regras que **nunca** podem ser violadas:

1. **Não crie login próprio** em serviço algum. Autenticação é responsabilidade exclusiva do Squamata-Login.
2. **Não aponte cliente para outro emissor** nem fabrique tokens localmente para "resolver" um ambiente. Se faltar `JWT_SECRET_LOGIN`, **pare** e peça a chave.
3. **Não trate o Squamata-Login como serviço satélite.** Ele não tem degradação graciosa: se cair, o fluxo de autenticação para.
4. **Ordem de operação:** ao subir o stack, `squamata-login` **primeiro**; ao derrubar, **por último**. Nunca o reinicie "de passagem" enquanto outro serviço está sendo validado.
5. **Ao testar autenticação** de Bot/Food/Mariano, garanta que o Squamata-Login está no ar — caso contrário o 401 é do ambiente, não do serviço testado.
6. **Ao diagnosticar 401 em cascata** em vários apps, suspeite primeiro do Squamata-Login: comece por `GET /api/v1/health` nele, não no app que reclama.
7. **Toda alteração no contrato de token** (claims, `appSlug`, `tenantId`, expiração, segredo) é mudança de plataforma: exige atualizar os consumidores no mesmo trabalho.

Detalhes, classificação de serviços e o que acontece em cada cenário de queda: [Architecture.md §1.1](./Architecture.md).

---

## 2. Stack e idioma

- **JavaScript ESM** (`import`/`export`) é o padrão absoluto. `require`/`module.exports` são proibidos.
- Backend Node.js + Express + Mongoose; frontend React (Vite, `.jsx`).
- Exceções: frameworks opinativos usam a stack nativa (Payload CMS); Go para alta carga; Python só para scripts de manutenção.
- **Nomes de código em inglês**; comentários, logs, mensagens de erro e UI em **PT-BR**.

---

## 3. Isolamento e contratos

- **Multi-tenancy inegociável:** toda requisição, sessão e consulta carrega e valida `appSlug` + `tenantId`.
- **APIs com caminho único:** todo recurso HTTP responde **apenas** em `/api/v{n}/<recurso>`, e todo serviço expõe **apenas** `GET /api/v1/health`. Não crie alias legado (`/api/<recurso>`). Webhooks de terceiros ficam fora do versionamento, em `/api/webhooks/...` ou no caminho já cadastrado no provedor. Ver [ADR 002](./docs/ADRs/002-versionamento-de-api.md).

---

## 4. Falha, reuso e segredos

- **Fail Fast:** faltou chave obrigatória ou o MongoDB não conectou? O serviço **quebra no boot**. Nunca rode em estado zumbi nem use segredo default como fallback.
- **Reutilize o ecossistema:** arquivos → `squamata-upload`; pagamentos/CEP → APIs centrais Squamata. Nunca recrie engrenagens.
- **Degradação graciosa só para satélites** (CEP, CMS, cliente satélite). Serviços de plataforma — MongoDB e Squamata-Login — **não** degradam: eles bloqueiam.
- **Segredos:** sempre `process.env`. Nunca commit de `.env`, nunca segredo em código, nunca imprimir chave em log ou resposta.

---

## 5. Antes de considerar a tarefa concluída

- **Entrega é branch + PR**, nunca commit direto na branch base: nomear a branch, escrever o corpo do PR com as evidências reais e atualizar o `MEMORY.md` do repositório no mesmo PR. Regras completas: [ai-rules.md §4.1](../docs/spec/ai-rules.md).
- Se a mudança toca rotas/API: rodar a skill [`calango-api-smoke-test`](./.github/skills/calango-api-smoke-test/SKILL.md) e reportar o resultado real das requisições.
- Se a mudança toca autenticação/token: validar com o Squamata-Login no ar e citar no relatório que ele é pré-requisito.
- Não declare sucesso sem verificar o comportamento — porta aberta não é prova de que a API responde.
