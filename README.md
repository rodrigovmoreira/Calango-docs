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
| [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) | **Instruções always-on** para agentes de IA. Contém as regras que valem em toda tarefa, incluindo a criticidade do Squamata-Login (SPOF). |
| `constitution.md` | Constituição de Engenharia (princípios, stack, "Dos" e "Don'ts"). |
| `Architecture.md` | Arquitetura e topologia do ecossistema, com as **dependências críticas** (§1.1). |
| [`docs/ADRs/`](./docs/ADRs) | Histórico de **decisões globais de arquitetura** (Architecture Decision Records): [`002-versionamento-de-api.md`](./docs/ADRs/002-versionamento-de-api.md) e [`003-squamata-login-provedor-unico.md`](./docs/ADRs/003-squamata-login-provedor-unico.md). |
| [`.github/agents/`](./.github/agents) | Agentes especializados, como o [`calango-local-stack`](./.github/agents/calango-local-stack.agent.md) (subir o stack local). |
| [`.github/skills/`](./.github/skills) | **Skills** de workflow sob demanda. Ex.: [`calango-api-smoke-test`](./.github/skills/calango-api-smoke-test/SKILL.md) — sobe os serviços e valida as APIs com requisições HTTP reais. |
| `templates/` | Modelos reutilizáveis de documentação, como o [`spec-template.md`](./templates/spec-template.md). |
| `docs/` | Documentação complementar e regras específicas (ex.: regras para agentes de IA). |

## ⚠️ Regra que vale antes de qualquer outra

O **`squamata-login` é o emissor único de identidade** do ecossistema e é **SPOF declarado**: sem ele, Calango-Bot, Calango-Food e marianos-meat **não permitem novo login**. Serviços apenas validam o JWT com `JWT_SECRET_LOGIN` — não existe login local nem emissor alternativo.

Consequências operacionais: subir o login **primeiro**, derrubá-lo **por último**, e nunca contornar sua ausência com mock ou segredo alternativo. Detalhes em [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) e [Architecture.md §1.1](./Architecture.md).

## 🚀 Antes de iniciar qualquer desenvolvimento

Todo desenvolvedor **e todo Agente de IA** deve, **obrigatoriamente**:

1. 📖 Ler a [`constitution.md`](./constitution.md) — os princípios são lei.
2. 🏗️ Ler a [`Architecture.md`](./Architecture.md) — para entender onde cada peça se encaixa.
3. 🗳️ Consultar a pasta [`docs/ADRs/`](./docs/ADRs) — para conhecer as decisões de arquitetura já tomadas.
4. 🧪 Após subir serviços, rodar a skill [`calango-api-smoke-test`](./.github/skills/calango-api-smoke-test/SKILL.md) — para provar que as APIs respondem.
5. 📝 Usar o [`templates/spec-template.md`](./templates/spec-template.md) para escrever a especificação antes de codar (**Spec-Driven Development**).

> ⚠️ **Nunca inicie código em um microsserviço sem antes consultar estas diretrizes.**
