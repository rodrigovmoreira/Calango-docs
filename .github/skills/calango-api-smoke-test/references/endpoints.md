# Contrato esperado por serviço

Este arquivo explica **por que** cada probe do [manifesto](../assets/smoke.manifest.json) espera aquele status. Se o manifesto e este documento divergirem, o manifesto vence (é o que o script executa) — atualize os dois juntos.

## Regra geral de interpretação

| Esperado | Significa |
| :--- | :--- |
| `200` | Rota pública saudável. |
| `401` | Rota **existe** e o middleware de auth está no caminho. Prova de montagem correta sem precisar de token. |
| `400` | Rota existe e validou payload. É o esperado para `POST` sem corpo obrigatório. |
| `404` | Só é esperado quando o teste **prova uma ausência** (ex.: webhook não deve estar em `/api/v1`) **ou** quando o próprio handler usa 404 para "registro não encontrado" — neste caso, valide o corpo com `expectBodyContains`. Em qualquer outro caso, 404 é falha de montagem. |
| `5xx` | Sempre falha de API (handler/boot), mesmo que o serviço esteja escutando. |

> **401 em app que depende do login:** `calango-bot`, `calango-food` e `marianos-meat` validam o JWT com `JWT_SECRET_LOGIN`, emitido pelo `squamata-login`. Se o login estiver fora do ar ou com segredo divergente, o 401 é **do ambiente de identidade** — valide `squamata-login` antes de acusar o app.

## Identidade é plataforma (SPOF)

O `squamata-login` é o emissor único de JWT do ecossistema. As probes dele existem para provar duas coisas:

1. O emissor está **vivo** (`/api/v1/health`).
2. As rotas de identidade estão **montadas** — `POST /api/v1/auth/login` responde pelo handler (404 de "usuário não encontrado", não rota ausente).

Se qualquer uma falhar, trate como **incidente de plataforma**: nenhum app permite novo login até ser resolvido. Ver [`Architecture.md` §1.1](../../../Architecture.md).

## Versionamento (ADR 002)

Todo backend expõe **apenas** `GET /api/v1/health` e **apenas** o caminho versionado para cada recurso. Não há alias legado.

Por isso o manifesto tem duas famílias de probe:

- **canônica** — o caminho `/api/v1/...` responde o status esperado;
- **guard (ausência)** — o caminho antigo responde **404**. Essas probes existem para impedir que a duplicação volte: se alguém reintroduzir `/api/tags` ou `/health`, o smoke test falha.

Exceções declaradas, que **não** devem ser versionadas:

- `POST /api/webhook` (Twilio) e `/api/meta/webhook` (Meta) no Calango-Bot.
- `POST /api/webhooks/payments/:provider` no Gateway (URL configurada no painel do provedor).
- `/api/{collection}` no `squamata-headless` (contrato do Payload CMS).

## Por serviço

### `squamata-login`

- `/api/v1/health` — health canônico do ecossistema (único).
- `POST /api/v1/auth/login` com `{}` → **404 com corpo** `"Usuário não encontrado."`. Não é rota ausente: o controller (`authController.js`) devolve 404 de negócio quando o e-mail não existe. Por isso a probe usa `expectBodyContains: "encontrado"` — status igual com corpo diferente também falha.
- `GET /api/v1/auth/health` → **404 esperado** (guard): health não mora sob `/auth`.

> Atenção: o Squamata-Login **não** tem rota de perfil (`/profile`). O perfil viaja no JWT.

### `calango-food`

- `/api/v1/health`; `/api/health` → **404 esperado** (guard).
- `/api/v1/products` e `/api/v1/orders` → 401 sem token (middleware `protect`).
- `PUT /api/v1/categories/reorder` → **rota testada com PUT**, porque é o caso clássico de ordem de registro (`/reorder` antes de `/:id`). 404 aqui indica que a rota foi engolida por `/:id`.
- `/api/products` → **404 esperado** (guard).

### `calango-bot`

- `/api/v1/health`; `/api/health` e `/api/tags` → **404 esperado** (guards).
- `tags`, `contacts`, `dashboard/summary` → 401 sem token; 200 com token.
- `/api/meta/webhook` → 400 sem parâmetros de verificação (rota existe, fora do versionamento).
- `/api/v1/meta/webhook` → **404 esperado**: prova que o webhook não vazou para o prefixo versionado.

### `squamata-gateway`

- `/api/v1/health`; `/health` → **404 esperado** (guard).
- `POST /api/v1/payments/create` com `{}` → 400 (validação), nunca 404/500.
- `POST /api/webhooks/payments/:provider` → 200/400 (namespace de webhook, fora do versionamento).
- `POST /v1/payments/create` → **404 esperado** (guard): o prefixo `/v1` sem `/api` deixou de existir.

### `squamata-upload`

- `/api/v1/health`; `/health` → **404 esperado** (guard).
- `POST /api/v1/upload/generate-upload-url` sem chave → 401 (`authMiddleware` compara `API_SECRET_KEY`).
- Com `--token <API_SECRET_KEY> --token-style raw` → 200 (URL assinada) ou 400 (payload inválido). **Nunca** use `Bearer` aqui: o serviço compara o header inteiro.
- `POST /generate-upload-url` → **404 esperado** (guard).

### `squamata-cep`

- `GET /api/v1/health` → 200.
- `GET /` → 200 (landing do serviço, não é API).

### `marianos-meat`

- `/api/v1/health`; `/api/health` → **404 esperado** (guard).
- `GET /api/v1/posts` → 200 (lista pública). Falha 500 aqui costuma ser banco indisponível, não rota.
- `GET /api/posts` → **404 esperado** (guard).

### `squamata-headless` (Payload)

- `GET /admin` → 200/302/307 (aplicação Next no ar).
- `GET /api/tenants` → 200/401/403 conforme access control da collection (valida que o REST do Payload montou).

## Como estender o manifesto

```json
{
  "name": "descrição curta e única",
  "method": "GET",
  "path": "/api/v1/recurso",
  "expect": [200],
  "auth": true,
  "expectAuthed": [200]
}
```

- `expect` é sempre um **array** de status aceitos.
- `auth: true` faz o script enviar `Authorization` quando houver `--token`; sem token, vale `expect` (use `[401]`).
- `expectAuthed` documenta o que se espera **com** token.
- `body` (objeto) envia JSON e define `Content-Type: application/json`.
- `expectBodyContains` (string, opcional) exige que a resposta contenha o trecho. Use quando o status sozinho é ambíguo — caso clássico: 404 de negócio ("registro não encontrado") versus 404 de rota ausente.
- `tier` (`plataforma` / `dominio` / `app` / `satelite`) e `spof: true` documentam criticidade; `dependsOn` lista dependências de plataforma. O script usa isso no resumo (alarme de SPOF e aviso de dependência não testada).

Regra de ouro ao adicionar probe: **prefira status que provam existência da rota sem exigir dados de negócio** (401/400) em vez de 200 que depende de seed/banco. Assim o teste continua confiável em qualquer ambiente.
