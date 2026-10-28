---
name: calango-api-smoke-test
description: 'Sobe serviços Node do ecossistema Calango/Squamata com npm run dev ou npm start e valida as APIs executando requisições HTTP reais contra a porta local. Use for testar APIs, smoke test, validar endpoints, subir e testar sistema, health check, testar rotas, verificar se a API responde, checar /api/v1, regressão antes de deploy.'
argument-hint: 'Qual serviço testar (ex: todos, calango-bot, login+food) ou uma URL base alternativa.'
---

# Calango API Smoke Test

Sobe um ou mais serviços do ecossistema **Calango/Squamata** como processos locais (`npm run dev` / `npm start`), espera ficarem prontos e **executa requisições HTTP reais** contra eles, comparando o status recebido com o contrato esperado.

O objetivo é responder com evidência: *"o serviço sobe e a API responde o que deveria?"* — e, quando não responde, dizer **onde** quebrou (boot, porta, rota, auth ou handler).

## Quando usar

- "As APIs ainda funcionam?" / "o serviço sobe?"
- Regressão antes de commit, PR ou deploy.
- Depois de mexer em rotas, prefixos (`/api` → `/api/v1`), middlewares de auth ou CORS.
- Quando um serviço "está no ar" mas o frontend recebe 404/401/500.
- Para validar um serviço recém-clonado (dependências + `.env` + boot + rota).

## Dependência central: Squamata-Login (SPOF)

O `squamata-login` é o **único emissor de identidade** do ecossistema e é **SPOF declarado** ([Architecture.md §1.1](../../../Architecture.md)). Consequências práticas para o teste:

- **Suba o Squamata-Login primeiro** e teste-o antes dos apps — `--service squamata-login,calango-bot,calango-food` na ordem em que aparecem.
- **Nunca** o derrube no meio da bateria: tokens novos deixam de ser emitidos e todo 401 dos outros serviços se torna ambíguo.
- `calango-bot`, `calango-food` e `marianos-meat` têm `dependsOn: ["squamata-login"]` no manifesto. Se o login não estiver no ar, um `401` no app é **do ambiente**, não do app — o script avisa quando a dependência não foi testada.
- Se o login falhar, o script destaca no resumo: `⚠️ SPOF com falha` — resolva isso antes de investigar os demais.

## Quando NÃO usar

- Testes unitários/integração do próprio repositório → rode `npm test` no projeto.
- Testar **produção** sem autorização explícita do usuário. Esta skill assume `localhost`.
- Subir containers → proibido aqui; para topologia e conflito de portas use o agente `calango-local-stack`.

## Fluxo

### 1. Definir escopo

Identifique quais serviços testar. "Tudo" = os serviços de aplicação (Mongo é externo e apenas validado).

Liste o que existe no manifesto antes de qualquer coisa:

```powershell
node Calango-docs/.github/skills/calango-api-smoke-test/scripts/smoke-test.mjs --list
```

```bash
node Calango-docs/.github/skills/calango-api-smoke-test/scripts/smoke-test.mjs --list
```

### 2. Checar pré-requisitos (sem inventar configuração)

| Verificação | Ação se falhar |
| :--- | :--- |
| `node -v` (LTS) | Pare e reporte. |
| `node_modules` na pasta do serviço | Instale: `npm install` (headless: `pnpm install`; food: `npm run install-all` na raiz do repo). |
| `.env` do repo existe | Pare e peça as chaves ao usuário. **Nunca** invente segredo nem aponte `MONGO_URI` para `localhost`. |
| Porta do serviço livre | Se estiver ocupada, identifique o dono antes de qualquer ação (`Get-NetTCPConnection -LocalPort <porta> -State Listen` / `lsof -nP -iTCP:<porta> -sTCP:LISTEN`). Se for um processo que você não subiu, **não mate**: pergunte ou use `--base` com outra porta. |

Portas, comandos e variáveis por serviço: [references/services.md](./references/services.md).

### 3. Subir o serviço em background, com log

Sempre em background (nunca em primeiro plano, senão o agente fica preso) e **sempre capturando o log** — sem log não há diagnóstico.

```powershell
# Windows (PowerShell) — um processo por serviço, fora do stdio do agente
$env:PORT='3999'
$p = Start-Process -FilePath "node" -ArgumentList "packages/backend/src/index.js" `
     -WorkingDirectory "C:/Calango-Project/Calango-food" -PassThru `
     -RedirectStandardOutput "$env:TEMP\food.out.log" -RedirectStandardError "$env:TEMP\food.err.log"
$p.Id    # guarde este PID: só ele pode ser encerrado no fim
```

```bash
# Linux / macOS
cd Calango-food
PORT=3999 npm run dev > /tmp/food.out.log 2>&1 &
echo $!    # guarde este PID
```

Regras do passo:

- Use o comando de start do serviço (`npm run dev` para desenvolvimento, `npm start` para rodar o entrypoint).
- Respeite a porta canônica. Para não conflitar com um serviço que o usuário já tem rodando, suba numa porta alternativa **via variável de ambiente** e teste com `--base`.
- Anote o PID de cada processo que você subiu. **Só esses PIDs podem ser encerrados.**

### 4. Esperar readiness e executar as requisições

Não use `sleep` fixo: o script já faz *polling* do healthcheck até o timeout.

```powershell
node Calango-docs/.github/skills/calango-api-smoke-test/scripts/smoke-test.mjs `
  --service calango-food --wait 60
```

```bash
node Calango-docs/.github/skills/calango-api-smoke-test/scripts/smoke-test.mjs \
  --service calango-food --wait 60
```

| Flag | Uso |
| :--- | :--- |
| `--service a,b` | Serviços a testar (nomes do manifesto). |
| `--all` | Todos os serviços do manifesto. |
| `--base <url>` | Sobrescreve a URL base (porta alternativa ou ambiente remoto autorizado). |
| `--token <jwt>` | Envia `Authorization: Bearer` nas probes autenticadas. |
| `--token-style raw` | Envia o token sem `Bearer` (usado pelo Squamata-upload). |
| `--wait <s>` | Tempo máximo de readiness (padrão 30). |
| `--timeout <ms>` | Timeout por requisição (padrão 5000). |
| `--only-ready` | Só espera o healthcheck (não roda as probes). |
| `--json` | Saída estruturada para consumo por outro agente/script. |

Códigos de saída do script: `0` todos os serviços prontos e probes dentro do contrato · `1` houve falha de readiness ou de probe · `2` erro de uso (flag inválida, serviço desconhecido). Use isso para decidir se o pipeline/relatório é verde.

### 5. Interpretar (esta é a parte que importa)

| Resultado | Significado | Próximo passo |
| :--- | :--- | :--- |
| `PASS` | Status dentro do esperado. | Nada. |
| `FAIL 404` em `/api/v1/...` mas `PASS` em `/api/...` | Rota não montada no prefixo versionado. | Ver montagem dupla em `server.js`/`index.js` e [ADR 002](../../../docs/ADRs/002-versionamento-de-api.md). |
| `FAIL 404` nos dois prefixos | Router não registrado, ordem de rotas (ex.: `/reorder` antes de `/:id`) ou `app.use` com array de paths onde um é prefixo do outro (falha no Express 5). | Ler o `server.js`/`index.js` do serviço. |
| `404` **esperado** mas com corpo de negócio | Cuidado: alguns handlers usam 404 para "registro não encontrado" (ex.: `POST /api/v1/auth/login` no Squamata-Login). Nesse caso 404 prova que a rota executou. Use `expectBodyContains` no manifesto para distinguir de rota ausente. | Conferir o controller antes de concluir que a rota sumiu. |
| `FAIL 401/403` onde se esperava `200` | Middleware de auth bloqueando rota que deveria ser pública — ou falta `--token`. | Repetir com `--token`. |
| `FAIL 500` | Boot OK, handler quebrando. | Ler o `.err.log`; quase sempre banco ou variável ausente. |
| `ERR ECONNREFUSED` | Processo não subiu ou está em outra porta. | Conferir log de boot e `PORT`/`BACKEND_PORT`. |
| `ERR timeout` | Porta ocupada por outro processo ou boot travado em dependência (ex.: Mongo). | Conferir log e dono da porta. |
| Readiness nunca passa | Serviço não cumpre o contrato mínimo. | Testar `--base` para confirmar que é o processo certo; ler log. |

Se o serviço responde mas o **contrato** está errado (status diferente do documentado), trate como falha de API, não de ambiente — e registre no relatório.

### 6. Encerrar o que você subiu

Sempre encerre **somente os PIDs anotados no passo 3** e a árvore que você criou, mesmo se os testes falharem.

```powershell
Stop-Process -Id 12345 -Force
```

```bash
kill 12345
```

**Atenção: `npm run dev` cria processo filho.** O PID que você anotou é do `npm`; quem escuta a porta é o filho (`nodemon`, `node --watch`, `vite`). Encerrar só o `npm` deixa o servidor no ar. Depois de matar o PID do `npm`, confira a porta e, se ainda estiver ocupada, identifique o dono **antes** de encerrar:

```powershell
$porta = 3999
Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    $child = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
    "{0} (pid {1}, pai {2}): {3}" -f $child.Name, $child.ProcessId, $child.ParentProcessId, $child.CommandLine
  }
```

```bash
lsof -nP -iTCP:3999 -sTCP:LISTEN
ps -o pid,ppid,command -p <pid>
```

Só encerre o processo da porta depois de confirmar que o `CommandLine`/`command` é do serviço testado e que o pai pertence à árvore que você iniciou. Em dúvida, **não mate**: reporte o conflito.

Se o serviço não precisar de watch, subir o entrypoint direto (`node server.js`, `node src/index.js`) simplifica a limpeza — o PID anotado é o próprio servidor.

Confirme que a porta liberou:

```powershell
(Test-NetConnection -ComputerName 127.0.0.1 -Port 3999 -InformationLevel Quiet -WarningAction SilentlyContinue)
```

```bash
lsof -nP -iTCP:3999 -sTCP:LISTEN || echo "porta livre"
```

## Formato de saída

1. Tabela por serviço:

   | Serviço | URL base | PID | Boot | Readiness | Probes (ok/total) |
   | :--- | :--- | :--- | :--- | :--- | :--- |

2. Tabela de falhas: `serviço | método | path | esperado | recebido | diagnóstico`.
3. Evidência mínima: código HTTP e trecho de resposta (sem segredos).
4. Processos encerrados (PIDs) e portas confirmadas como livres.
5. Pendências que impediram o teste (ex.: `MONGO_URI` ausente, `node_modules` faltando) — separadas das falhas de API.

## Regras

- **Nunca** imprimir, colar ou commitar conteúdo de `.env`; ao citar uma chave, mascare (`//***@`, `JWT_SECRET=***`).
- **Nunca** rodar Docker/containers nem alterar `docker-compose.yml`.
- **Nunca** iniciar `mongod` nem trocar a URI do banco para `localhost`.
- **Nunca** matar processo por nome (`Stop-Process -Name`, `pkill -f`); sempre por PID que você mesmo subiu.
- **Não** altere código de aplicação para "fazer o teste passar" sem autorização: primeiro reporte a falha com evidência.
- **Não** chame URL pública/produção sem autorização explícita.
- Serviço "no ar" (porta em `Listen`) **não** é sucesso: sucesso é a probe retornar o status esperado.

## Recursos

- [scripts/smoke-test.mjs](./scripts/smoke-test.mjs) — executor de probes (Node ≥ 18, sem dependências).
- [assets/smoke.manifest.json](./assets/smoke.manifest.json) — contrato esperado por serviço. **Fonte de verdade das probes**; estenda aqui ao criar rotas.
- [references/services.md](./references/services.md) — pastas, comandos, portas e variáveis por serviço.
- [references/endpoints.md](./references/endpoints.md) — o que cada serviço deve responder e por quê.
