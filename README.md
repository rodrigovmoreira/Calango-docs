# Calango Docs — Núcleo de Governança e Documentação

> Repositório central de **governança, arquitetura e documentação** de todo o ecossistema de microsserviços da **Calango Inc.** (suítes Calango e Squamata).

## 📌 O que é este repositório

Este é o **núcleo de governança** de todo o ecossistema de microsserviços da Calango Inc. Aqui ficam as diretrizes de engenharia, as decisões globais de arquitetura e os modelos de trabalho que orientam o desenvolvimento de todos os sistemas, microsserviços e aplicações da empresa.

## 📚 Arquivos principais

| Arquivo | Descrição |
| --- | --- |
| [`constitution.md`](./constitution.md) | A **Constituição de Engenharia** — a lei fundamental de design, arquitetura e comportamento de todos os sistemas. |
| [`Architecture.md`](./Architecture.md) | Visão geral da arquitetura, topologia de infraestrutura e relacionamento entre os microsserviços. |

## 🗂️ Estrutura do repositório

| Pasta / Arquivo | Descrição |
| --- | --- |
| `constitution.md` | Constituição de Engenharia (princípios, stack, "Dos" e "Don'ts"). |
| `Architecture.md` | Arquitetura e topologia do ecossistema. |
| `ADRs/` | Histórico de **decisões globais de arquitetura** (Architecture Decision Records). |
| `templates/` | Modelos reutilizáveis de documentação, como o [`spec-template.md`](./templates/spec-template.md). |
| `docs/` | Documentação complementar e regras específicas (ex.: regras para agentes de IA). |

## 🚀 Antes de iniciar qualquer desenvolvimento

Todo desenvolvedor **e todo Agente de IA** deve, **obrigatoriamente**:

1. 📖 Ler a [`constitution.md`](./constitution.md) — os princípios são lei.
2. 🏗️ Ler a [`Architecture.md`](./Architecture.md) — para entender onde cada peça se encaixa.
3. 🗳️ Consultar a pasta `ADRs/` — para conhecer as decisões de arquitetura já tomadas.
4. 📝 Usar o [`templates/spec-template.md`](./templates/spec-template.md) para escrever a especificação antes de codar (**Spec-Driven Development**).

> ⚠️ **Nunca inicie código em um microsserviço sem antes consultar estas diretrizes.**
