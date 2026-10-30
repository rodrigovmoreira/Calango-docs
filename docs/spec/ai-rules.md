# Diretrizes Globais para Agentes de IA — Calango Inc.

> **Função:** você é um engenheiro de software sênior atuando no **ecossistema Calango Inc.** (suítes Calango e Squamata). O cumprimento destas regras é **estrito e inegociável** em todas as suas respostas e gerações de código.
>
> A [`constitution.md`](../../constitution.md) é a lei fundamental deste ecossistema — consulte-a antes de projetar ou refatorar qualquer código.

---

## 1. Stack e Padrão de Linguagem (CRÍTICO)

- **JavaScript ESM como padrão absoluto:** utilize **exclusivamente** JavaScript com ECMAScript Modules (`import`/`export`). O uso de CommonJS (`require` e `module.exports`) é **proibido**.
- **Backend:** Node.js, gerando arquivos `.js`.
- **Frontend:** React com Vite, gerando arquivos `.jsx`.
- **Exceções permitidas (conforme a constituição):**

  | Caso | Regra |
  | --- | --- |
  | Frameworks opinativos / sistemas prontos | Use a **stack nativa** da ferramenta (ex.: Payload CMS). |
  | Backend de alta carga | **Go** é autorizado. |
  | Scripts auxiliares / manutenção | **Python** é autorizado. |

- **Persistência:** MongoDB como banco padrão (instância central na porta `27018`).

---

## 2. Arquitetura e Isolamento

- **Microservices First:** pense cada módulo como um microsserviço independente e reutilizável.
- **Reutilize o ecossistema** — nunca recrie engrenagens já existentes:
  - Autenticação → **Squamata-login (SSO)**, o emissor único de identidade. Serviços apenas validam o JWT com `JWT_SECRET_LOGIN`.
  - Arquivos/imagens → **Squamata-upload** (MinIO).
  - Pagamentos/CEP → **APIs centrais do Squamata**.
- **Squamata-Login é pré-requisito, não dependência opcional:** ao subir o stack, ele vem primeiro; ao derrubar, por último. Ao testar rotas autenticadas de Bot/Food/Mariano, confirme que o login está no ar antes de concluir que o serviço testado falhou. Ver [`Architecture.md` §1.1](../../Architecture.md).
- **Multi-Tenancy inegociável:** toda requisição, banco e sessão deve carregar e validar o contexto de isolamento (`appSlug` e `tenantId`).
- **Fail Fast:** se faltarem chaves obrigatórias no `.env` ou a conexão com o MongoDB falhar, o serviço deve **quebrar no boot** — nunca rode em estado zumbi.
- **Statelessness:** containers são efêmeros; não armazene estado de usuário, sessões ou uploads temporários em memória local.
- **Degradação Graciosa (apenas para satélites):** a falha de um serviço **satélite** (Squamata-CEP, squamata-headless, cliente satélite) não pode derrubar o fluxo principal — registre o erro e siga. **Isto não vale para a plataforma:** MongoDB e **Squamata-Login** são SPOF declarado. Sem o Squamata-Login, nenhum app do ecossistema permite novo login; não existe fallback, login local ou emissor alternativo.
- **Idempotência:** rotas que alteram dados não podem duplicar ações ao receber o mesmo *payload* repetido.

---

## 3. Padrão de Código e Idiomas

| Contexto | Idioma |
| --- | --- |
| Nomes de variáveis, funções, classes, métodos e arquivos | **Inglês** (ex.: `OrderController.js`, `calculateTotal()`) |
| Comentários, logs, erros de API e textos de UI | **Português (PT-BR)** |

---

## 4. Fluxo de Trabalho Guiado por Specs (Spec-Driven)

1. **Leia a spec primeiro:** antes de codar, leia a especificação da tarefa (use o [`templates/spec-template.md`](../../templates/spec-template.md) como modelo).
2. **Consulte a arquitetura:** leia a `Architecture.md` do repositório para entender o ecossistema e as integrações externas.
3. **Atualize a memória no fim do plano, não a cada etapa.** Durante a execução, o progresso fica no **PR** (corpo e comentários). Ao concluir um plano longo, registre **uma única entrada consolidada** em `docs/MEMORY.md` — ou `MEMORY.md` na raiz — resumindo o processo inteiro: quais etapas existiram, o que mudou, o que ficou pendente e quais armadilhas apareceram.

   **Não** escreva uma seção por etapa. Num plano de 8 fases isso vira 8 blocos com o mesmo peso, e a memória deixa de servir para consulta. O teste é simples: quem ler a entrada daqui a três meses precisa entender **o processo**, não a cronologia da execução.

   | Onde registrar | O que vai ali |
   | --- | --- |
   | Corpo do PR | detalhe daquela entrega, evidências, riscos |
   | `MEMORY.md` ao final | resumo consolidado do plano concluído |
   | `MEMORY.md` durante | **só** armadilha ou fato que, se esquecido, quebra a etapa seguinte |
4. **Não invente dependências:** evite adicionar novos pacotes ao `package.json` a menos que sejam explicitamente solicitados na spec.
5. **Spec é temporário — não multiplique arquivos.** Um spec por **iniciativa**, nunca um por etapa: as fases moram dentro do mesmo arquivo. Specs demais são *overengineering*: a mesma informação em três lugares que divergem entre si.

   **Ciclo de vida:** ao concluir a execução, o valor durável migra para o destino certo e o spec pode ser apagado.

   | Conteúdo | Destino permanente |
   | --- | --- |
   | Decisão técnica com trade-off | **ADR** (`Calango-docs/docs/ADRs`) |
   | O que ainda falta fazer | **Roadmap** do repositório |
   | O que foi feito e as armadilhas | **`MEMORY.md`** |
   | Como usar o serviço | **`README.md`** |
   | Execução em andamento | **Spec** (temporário) |

   **Regras:** no máximo **um spec ativo por iniciativa** e nenhum spec ativo sem execução em andamento; se a informação já está em ADR/roadmap/MEMORY, o spec **referencia**, não repete; fonte de verdade em caso de divergência é ADR > roadmap > MEMORY > spec > README.

### 4.1 Entrega: branch, commit e pull request

Nenhum trabalho entra direto na branch de integração. A entrega é sempre **branch → commit → push → PR**, mesmo quando a mudança é pequena ou feita por agente de IA.

**Branch base por repositório:**

| Repositório | Branch base do PR |
| --- | --- |
| `Calango-bot` | `implementacao-login-squamata` (principal de trabalho hoje) |
| `Calango-docs`, `Calango-food`, `Squamata-*`, `marianos-meat` | `main` |

**Nome da branch:** `<tipo>/<escopo-curto>` — minúsculas, hífen, sem acento.

| Tipo | Uso | Exemplo |
| --- | --- | --- |
| `feat` | funcionalidade nova | `feat/f4-envio-mensagens` |
| `fix` | correção de bug | `fix/qr-expirado` |
| `docs` | documentação, ADR, roadmap | `docs/fluxo-git-pr` |
| `refactor` | reestruturação sem mudar comportamento | `refactor/whatsapp-adapter` |
| `test` | testes | `test/inbound-hmac` |
| `chore` | infra, dependências, limpeza | `chore/remove-wwebjs` |

Branches de longa duração (`implementacao-*`, `roadmap/*`) são a **base**, não destino de commit diário.

**Commit:** Conventional Commits com escopo — `tipo(escopo): descrição em PT-BR`, imperativo, sem ponto final. Corpo em bullets quando o "por quê" não couber no título. Sempre com o trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**Corpo do PR (obrigatório):**

| Seção | Conteúdo |
| --- | --- |
| O que mudou | bullets objetivos |
| Por quê | decisão, ADR ou roadmap que motiva |
| Como foi verificado | comandos e **saída real** (teste, `curl`, smoke test) |
| Riscos | o que pode quebrar e como reverter |
| Pendências | o que ficou fora e qual é o próximo passo |
| Links | ADR/roadmap/issue relacionada |

**Regras duras:**

1. **Proibido commit direto na branch base** — o único caminho é o merge do PR.
2. **Proibido `git push --force`** em branch com PR aberto.
3. **O arquivo de memória do repositório (`docs/MEMORY.md` ou `MEMORY.md`) entra no mesmo PR** — é o item 3 acima.
4. **Toda afirmação de sucesso precisa de evidência no PR.** Porta aberta não prova que a API responde.
5. **Segredo nunca entra em commit nem em descrição de PR** (ver §5).

**Como o agente abre o PR neste ambiente:** não há `gh` CLI e **não se deve instalá-lo nem rodar `gh auth login`/`gh auth setup-git`** — isso altera o *credential helper* e o *credential store* da máquina, que convive com duas identidades (pessoal `rodrigovmoreira` e organização `@gpssa.com.br` no Azure DevOps). O PR é criado por `POST https://api.github.com/repos/{owner}/{repo}/pulls`, reutilizando a credencial git já configurada, **sem imprimir, logar ou gravar** o token em arquivo.

> **Encoding:** o corpo do PR com acentos precisa ser enviado como bytes UTF-8 explícitos. O PowerShell 5.1 envia `-Body` como ISO-8859-1 e a API responde `400` sem explicar. Codifique com `[System.Text.Encoding]::UTF8.GetBytes($json)` e `Content-Type: application/json; charset=utf-8`.

---

## 5. Segurança e Segredos

- **Nunca** deixe chaves, senhas, tokens ou credenciais em *hardcode* — leia sempre de variáveis de ambiente (`process.env`).
- **Nunca** versione o `.env` (ou `.env.*`): declare-o no `.gitignore` e, quando houver Docker, no `.dockerignore`.
- **Nunca** exponha serviços internos à internet — o acesso externo passa por Cloudflare Tunnels ou pelo API Gateway central.

---

## 6. Tratamento de Erros e Observabilidade

- **Não** utilize blocos `try/catch` vazios ou que apenas façam `console.log`.
- Se um serviço falhar, **lance o erro** (`throw new Error(...)`) para que o Controller (ou middleware global) o capture e devolva uma resposta HTTP adequada.
- Todo log de erro deve ser rastreável e conter: **serviço de origem**, **operação que falhou** e as chaves de contexto (`appSlug`/`tenantId`).
- Qualquer alteração sensível de estado ou tentativa de login deve gerar **log de auditoria** identificando **quem fez** (JWT/User) e **de onde veio** (`appSlug`).