# Serviços, pastas, comandos e portas

Fonte de verdade complementar: agente [`calango-local-stack`](../../../agents/calango-local-stack.agent.md) — use-o para resolver conflito de porta ou ajuste de `.env`.

## Topologia local (sem Docker)

| Serviço (nome no manifesto) | Pasta | Comando | Porta | Chave da porta | Camada | Observação |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `squamata-login` | `Squamata-login/packages/backend` | `npm run dev` | 3001 | `PORT` | **plataforma (SPOF)** | Provedor de identidade (SSO). **Subir primeiro, derrubar por último.** |
| `calango-food` | `Calango-food/packages/backend` | `npm run dev` | 3002 | `PORT` | app | Lê `Calango-food/.env`. Depende do login. |
| `calango-bot` | `Calango-bot/backend` | `npm run dev` | 3003 | **`BACKEND_PORT`** | app | Não usa `PORT`; `npm start` também sobe direto. Depende do login. |
| `squamata-upload` | `Squamata-upload` | `npm start` | 3005 | `PORT` | domínio | Sem script `dev`. |
| `squamata-headless` | `squamata-headless` | `pnpm dev` | 3006 | `PORT` | satélite | Payload/Next; padrão seria 3000. |
| `squamata-gateway` | `Squamata-gateway` | `npm run dev` | 3010 | `PORT` | domínio | `node --watch server.js`. |
| `squamata-cep` | `Squamata-cep` | `npm run dev` | 3011 | `PORT` | satélite | Padrão do código é 3000 → precisa de `PORT`. |
| `marianos-meat` | `marianos-meat/backend` | `npm run dev` | 3020 | `PORT` | satélite | Depende do login; padrão 3000, compose usa 3005. |

Frontends (fora do escopo desta skill, que testa API):

| Frontend | Pasta | Comando | Porta |
| :--- | :--- | :--- | :--- |
| `squamata-login` | `Squamata-login/packages/frontend` | `npm run dev` | 5174 |
| `calango-food` | `Calango-food/packages/frontend` | `npm run dev` | 5173 |
| `calango-bot` | `Calango-bot/frontend` | `npm start` | 3004 |
| `marianos-meat` | `marianos-meat/frontend` | `npm run dev` | 5175 |

> Nenhum serviço local usa a porta **3000**: é o default ambíguo de CRA/Next/CEP/Mariano.

## Variáveis por serviço

Nunca invente valores. Se a chave não existir no `.env`, pare e peça ao usuário.

| Serviço | Chaves que o boot exige | Efeito da ausência |
| :--- | :--- | :--- |
| `squamata-login` | `MONGO_URI`, `JWT_SECRET_LOGIN` | Não conecta ao banco / não emite token. |
| `calango-food` | `MONGO_URI`, `JWT_SECRET_LOGIN` | API sobe, mas rotas de dados falham. |
| `calango-bot` | `MONGO_URI`, `JWT_SECRET`, `JWT_SECRET_LOGIN`, `BACKEND_PORT` | `validateEnv` derruba o boot. |
| `squamata-gateway` | `MONGO_URI` | `connectDB()` antes do `listen` — sem banco a porta não abre. |
| `squamata-upload` | `API_SECRET_KEY`, `FIREBASE_BUCKET`, `credentials.json` | Sobe, mas `POST /api/v1/upload/generate-upload-url` falha. |
| `marianos-meat` | `MONGO_URI`, `JWT_SECRET` | Rotas de dados falham. |
| `squamata-headless` | `PAYLOAD_SECRET`, `DATABASE_URI`, `NEXT_PUBLIC_SERVER_URL` | Boot do Payload falha. |
| `squamata-cep` | nenhuma obrigatória | Só responde `/`. |

## Particularidades que já custaram tempo

0. **`squamata-login` é SPOF de autenticação** — suba primeiro, teste primeiro, derrube por último. Sem ele, nenhum app permite novo login. Ver [`Architecture.md` §1.1](../../../Architecture.md).
1. **`calango-bot` ignora `PORT`** — a porta vem de `BACKEND_PORT`. Subir com `PORT=3999` não muda nada.
2. **`squamata-gateway` só abre a porta depois do Mongo** — `connectDB().then(listen)`. Readiness por TCP pode dar falso negativo; use a probe HTTP.
3. **`squamata-upload` usa `npm start`** — não existe `dev`; `npm run dev` falha.
4. **`squamata-headless` é `pnpm`** — `npm install`/`npm run dev` quebram o lockfile/fluxo.
5. **Um caminho único por rota (ADR 002)** — não existe alias. Se um `/api/...` antigo voltar a responder, a probe *guard* do manifesto falha. Não "conserte" isso adicionando o alias de volta: remova-o.
6. **Rotas de webhook** (`/api/webhook`, `/api/meta/webhook`, `/api/webhooks/payments/:provider`) não são versionadas — a probe desses caminhos deve esperar o caminho **sem** `/v1`.

## Subir numa porta alternativa (sem brigar com processo existente)

```powershell
# Windows — a variável de ambiente vence o .env do dotenv (dotenv não sobrescreve env existente)
$env:PORT='3999'
Start-Process node -ArgumentList "packages/backend/src/index.js" `
  -WorkingDirectory "C:/Calango-Project/Calango-food" -PassThru `
  -RedirectStandardOutput "$env:TEMP\food.out.log" -RedirectStandardError "$env:TEMP\food.err.log"
```

```bash
PORT=3999 npm run dev > /tmp/food.out.log 2>&1 &
```

Depois: `--service calango-food --base http://localhost:3999`.

Exceção: no `calango-bot`, use `BACKEND_PORT` em vez de `PORT`.
