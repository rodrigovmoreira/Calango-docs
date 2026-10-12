# [Título da Tarefa]

<!--
  TÍTULO E OBJETIVO DA TAREFA
  ---------------------------
  Descreva em poucas linhas O QUE será feito e POR QUÊ.
  Ex.: "Implementar o fluxo de checkout do Calango Food integrado ao Squamata-gateway."
-->

## Dependências

<!--
  O QUE ADICIONAR / REMOVER
  -------------------------
  - Pacotes/bibliotecas a instalar ou remover (com versão, se relevante).
  - Serviços do ecossistema consumidos (Squamata-login, Squamata-upload, etc.).
  - Novos containers, recursos de infraestrutura ou redes (squamata-global).
-->

## Variáveis de Ambiente Necessárias

<!--
  Liste as variáveis obrigatórias e opcionais do .env, com descrição.
  Lembre-se: segredos NUNCA em hardcode — sempre via variáveis de ambiente.
  Ex.:
  - MONGO_URI: string de conexão com o MongoDB central (porta 27018).
  - APP_SLUG: identificador de isolamento multi-tenant.
-->

## Regras de Implementação

<!--
  Restrições e orientações obrigatórias (consulte a constitution.md):
  - Design sem estado (Statelessness).
  - Idempotência nas rotas que alteram dados.
  - Observabilidade: logs com serviço de origem + appSlug/tenantId.
  - Degradação graciosa para serviços satélites.
  - Segredos apenas via variáveis de ambiente (nunca hardcode).
-->

## Arquivos Afetados no Repositório

<!--
  Liste os arquivos que serão criados, alterados ou removidos.
  Ex.:
  - src/services/checkout.service.js (novo)
  - .env.example (atualizar)
-->

## Critérios de Aceite (Checklist)

<!--
  Marque todos os itens para considerar a tarefa concluída.
-->

- [ ] Critério de aceite 1
- [ ] Critério de aceite 2
- [ ] Critério de aceite 3
