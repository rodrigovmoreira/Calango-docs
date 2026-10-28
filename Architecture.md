# Especificação de Arquitetura e Infraestrutura Padrão — Calango Inc.

Este documento estabelece as diretrizes de engenharia de software, padrões de código e a topologia de infraestrutura para o ecossistema de microsserviços **Squamata** e as aplicações integradas.

Qualquer novo módulo, bot, API ou interface gráfica a ser desenvolvida neste ecossistema **DEVE** seguir rigorosamente as especificações descritas neste documento.

---

## 1. Visão Geral da Arquitetura

O ecossistema baseia-se em uma arquitetura de **Microsserviços Desacoplados**, projetada para garantir escalabilidade horizontal leve e isolamento de falhas dentro de um ambiente auto-hospedado.
A espinha dorsal de segurança do sistema é o **Squamata-login**, um provedor de identidade centralizado que opera sob o modelo **Single Sign-On (SSO)**. As aplicações clientes delegam a autenticação para este microsserviço, que emite tokens criptografados baseados no escopo de acesso do usuário.

### 1.1. Dependências Críticas e Ordem de Subida (SPOF)

O **Squamata-Login é o ponto único de falha (SPOF) da autenticação** de todo o ecossistema. Ele não é um serviço satélite: sem ele, nenhuma aplicação permite novo login.

#### Camadas de dependência

| Camada | Serviço | Se cair | Impacto |
| :--- | :--- | :--- | :--- |
| **Plataforma** | MongoDB (`27018`) | Todos os serviços perdem persistência. | Total |
| **Plataforma** | `squamata-login` | Nenhum login novo em Calango-Bot, Calango-Food, marianos-meat. | Total para autenticação |
| **Domínio** | `squamata-gateway` | Checkout/pagamento falha; navegação e catálogo seguem. | Parcial |
| **Domínio** | `squamata-upload` | Upload de imagem falha; resto do app segue. | Parcial |
| **Satélite** | `squamata-cep`, `squamata-headless`, `marianos-meat` | Fluxo principal segue com erro registrado. | Baixo |

> **Como ler esta tabela:** a camada descreve o impacto da queda **deste** serviço sobre os demais. Ela é independente de quem **consome** o login: `marianos-meat` é satélite (sua queda não afeta ninguém), mas ainda assim depende do Squamata-Login para autenticar. A dependência de identidade é universal para todo app que usa SSO.

#### Quem autentica o quê

Nenhum cliente possui formulário de login local (ver §4.2). O Squamata-Login emite o JWT e cada serviço apenas o **verifica localmente** com `JWT_SECRET_LOGIN`:

| Consumidor | Evidência no código | Segredo |
| :--- | :--- | :--- |
| Calango-Bot | `backend/middleware/auth.js` → `jwt.verify(token, process.env.JWT_SECRET_LOGIN)` | `JWT_SECRET_LOGIN` |
| Calango-Food | `packages/backend/src/middlewares/authMiddleware.js` → idem | `JWT_SECRET_LOGIN` |

Consequência importante: a verificação é **stateless**. Com o Squamata-Login fora do ar, tokens já emitidos continuam válidos até expirarem — mas **não há emissão de novos tokens** e nenhum fluxo de refresh/OAuth/callback funciona.

#### Ordem obrigatória de operação

```
Subir:    MongoDB → squamata-login (backend, frontend) → demais serviços
Derrubar: demais serviços → squamata-login → MongoDB
```

Reiniciar o Squamata-Login no meio de uma bateria de testes invalida o diagnóstico de autenticação dos outros serviços.

#### Regras de plataforma

1. **Emissor único.** Nenhum serviço cria login, emite token nem aponta para outro emissor.
2. **Segredo compartilhado idêntico** em Squamata-Login, Calango-Bot e Calango-Food. Divergência = 401 em todos.
3. **Sem fallback de segredo.** `JWT_SECRET_LOGIN` ausente deve derrubar o boot (ver "Errar Rápido" na [`constitution.md`](./constitution.md)), nunca assumir valor default.
4. **Mudança de contrato de token** (`appSlug`, `tenantId`, claims, expiração, segredo) exige atualizar todos os consumidores na mesma entrega.
5. **Healthcheck obrigatório:** `GET /api/v1/health` — caminho único, sem alias.
6. **Diagnóstico:** 401 em cascata → verificar o Squamata-Login primeiro.

---

## 2. Stack Tecnológica Padrão (Mandatória)

Para mitigar a complexidade de manutenção e otimizar o consumo de recursos de hardware, fica padronizada a seguinte stack tecnológica:

### 2.1. Camada de Backend (APIs e Bots)
* **Ambiente de Execução:** Node.js (Versões LTS estáveis).
* **Padrão de Módulos:** **ECMAScript Modules (ESM)** nativo. É estritamente proibida a utilização do padrão legado CommonJS (`require`). Todos os arquivos devem utilizar as palavras-chave `import` e `export`. O arquivo `package.json` deve conter a propriedade `"type": "module"`.
* **Framework Web:** Express.js para roteamento e gerenciamento de middlewares HTTP.
* **Modelagem de Dados:** Mongoose para persistência de dados orientada a documentos (NoSQL).

### 2.2. Camada de Frontend (Interfaces Web)
* **Biblioteca Principal:** React.js.
* **Ferramenta de Build:** Vite (para compilação otimizada, Hot Module Replacement e performance em desenvolvimento).
* **Gerenciamento de Estado/Estilos:** Componentização moderna com foco em responsividade e consistência visual.

### 2.3. Camada de Persistência e Storage
* **Banco de Dados:** MongoDB (instâncias isoladas logicamente por banco, compartilhando infraestrutura dedicada).
* **Armazenamento de Objetos (S3):** MinIO Local ou Firebase Storage, gerenciados exclusivamente pelo microsserviço centralizador `squamata-upload`.

---

## 3. Mapeamento da Infraestrutura (Docker & Home Lab)

Todos os componentes do ecossistema operam containerizados através do Docker e compartilham uma rede virtual externa isolada.

### 3.1. Rede Docker Externa
Fica instituída a rede **`squamata-global`** como o barramento de rede padrão para a comunicação interna entre containers. Todo novo `docker-compose.yml` deve se acoplar a esta rede como um recurso externo.

### 3.2. Catálogo de Serviços e Portas de Produção

| Nome do Container | Porta Host (Exposta) | Porta Container (Interna) | Escopo / Responsabilidade Técnica |
| :--- | :--- | :--- | :--- |
| `squamata-login-backend` | `3001` | `3001` | Provedor de Identidade, Autenticação e Emissão de JWT (SSO). |
| `squamata-login-frontend` | `5174` | `5174` | Tela centralizada de Login (Nativo e Google OAuth). |
| `calango-bot-backend` | `3003` | `3001` | Core de processamento do CRM e automações do bot principal. |
| `calango-bot-frontend` | `3004` | `3000` | Painel web administrativo do Calango Bot. |
| `squamata-upload` | `3005` | `3005` | API de ingestão, processamento e geração de Signed URLs para imagens. |
| `squamata-image-minio` | `9000` / `9001` | `9000` / `9001` | Servidor de armazenamento s3 de mídias e arquivos em disco local. |
| `marianos-meat-marianos-meat-1` | `5175` | `80` | Aplicação cliente satélite (Exemplo de expansão da rede). |

### 3.3. Distribuição de Hardware Físico
* **Servidor de Aplicação Principal (Dell Optiplex 790):** Executa o daemon do Docker sob o sistema operacional Fedora Linux, hospedando todos os containers de microsserviços e frontends.
* **Servidor de Banco de Dados Dedicado (Dell Optiplex 3010):** Roda exclusivamente a instância de produção do MongoDB nativo via `mongod.service` na porta customizada **`27018`**. Os containers de aplicação realizam a conexão apontando diretamente para este IP de rede interna.

---

## 4. Padrões de Multi-Tenancy e Segurança

O ecossistema adota uma arquitetura de arquitetura lógica multi-inquilino (Multi-Tenancy) baseada em escopo dinâmico.

### 4.1. Pilares de Isolamento de Dados
Cada requisição trafegada no ecossistema e cada assinatura de token JWT deve conter obrigatoriamente duas chaves de contexto:
1.  **`appSlug`:** Identificador textual único da aplicação cliente (ex: `calango-bot`, `calango-food`, `squamata-login`,`squamata-upload`).
2.  **`tenantId`:** Identificador de isolamento do cliente final ou filial específica dentro daquela aplicação (ex: `default`, `barbearia-x`, `filial-osasco`).

### 4.2. Fluxo de Redirecionamento Dinâmico (SSO)
As aplicações front-end não possuem formulários de login locais. O fluxo obrigatório de autenticação segue os passos:
1.  O cliente acessa a URL de uma aplicação (ex: `http://localhost:5175`).
2.  Caso não possua um token válido local, a aplicação o redireciona para o frontend do SSO passando parâmetros via query string: 
    `http://localhost:5174/login?appSlug=marianos-meat&tenantId=default&returnUrl=http://localhost:5175`
3.  O `squamata-login-backend` processa a credencial ou o fluxo OAuth do Google. No caso do Google, os parâmetros (`appSlug`, `tenantId`, `returnUrl`) são empacotados em Base64 no parâmetro `state`.
4.  Após a validação, o backend realiza o redirecionamento dinâmico estritamente para a URL informada no `returnUrl`, anexando o token JWT gerado.

### 4.3. Mecanismos Obrigatórios de Defesa (Kill-Switch e Auditoria)
* **Flag `isActive`:** Todo modelo de usuário possui este campo booleano. Se alterado para `false`, middlewares de segurança em todas as APIs devem negar o acesso imediatamente com HTTP 403.
* **Logs de Auditoria:** Toda tentativa de login (sucesso ou falha) deve ser persistida na coleção `AuditLog`, registrando IP, data, tipo de evento e o `appSlug` solicitante.

### 4.4. Versionamento de API (Decisão [ADR 002](./docs/ADRs/002-versionamento-de-api.md))
Toda API HTTP do ecossistema expõe seus recursos no caminho canônico **`/api/v{major}/<recurso>`** (ex.: `/api/v1/orders`).

* **Apenas o número *major***: `v1`, nunca `v1.0` ou `v1.4.2`. Correções e adições compatíveis são aplicadas *in place* dentro do mesmo major.
* **O prefixo `/api` é mantido** — funciona como namespace de roteamento para os frontends e o proxy reverso.
* **Um caminho único por rota.** Não há alias legado: cada recurso responde apenas em `/api/v1/...`. O smoke test valida a ausência dos caminhos antigos.
* **Sem interceptor de rewrite:** os clientes declaram o caminho versionado explicitamente; a `baseURL` aponta apenas para o host.
* **Webhooks de terceiros não são versionados** e vivem em namespace próprio (`/api/webhooks/...`), porque a URL é configurada no painel do provedor e precisa permanecer estável entre versões.
* **Healthcheck padrão:** todo serviço expõe `GET /api/v1/health`.
* **Quebra de contrato** exige novo major com período de convivência, sinalizado pelos headers `Deprecation` (RFC 9745) e `Sunset` (RFC 8594).
* **Exceção declarada:** o `squamata-headless` (Payload CMS) mantém `/api/{collection}`, por ser contrato do framework.

---

## 5. Guia para Criação de Novos Componentes (Blueprint)

Ao iniciar o desenvolvimento de qualquer nova aplicação no ecossistema (seja uma API ou um Painel Web), as seguintes regras de infraestrutura devem ser aplicadas:

### 5.1. Dockerfile de Referência (Multi-Stage para Produção)
Backends em Node.js devem utilizar Dockerfiles de dois estágios para garantir imagens finais limpas e livres de dependências de desenvolvimento:

```dockerfile
# Estágio 1: Build e Instalação de Dependências
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Estágio 2: Ambiente de Execução Leve
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/src ./src

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/index.js"]

```

### 5.2. Padrão de Anexação ao Docker Compose Global
Qualquer novo arquivo docker-compose.yml deve declarar a rede global de forma externa para se plugar ao ecossistema existente:

```dockerfile
YAML
version: '3.8'

services:
  novo-microsservico-backend:
    build:
      context: ./
      dockerfile: ./Dockerfile
    container_name: novo-microsservico-backend
    restart: unless-stopped
    ports:
      - "PRODUCAO_PORT:INTERNA_PORT"
    env_file:
      - .env
    networks:
      - squamata-global

networks:
  squamata-global:
    external: true

```

### 5.3. Validação de Entrega (Checklist de Homologação)
Antes de realizar o deploy de uma nova rota ou serviço no servidor principal, certifique-se de que:

[ ] O código utiliza sintaxe ESM pura (import/export).

[ ] O container realiza healthcheck HTTP interno apontando para uma rota /health.

[ ] Todas as conexões ao MongoDB passam pela string parametrizada apontando para a porta 27018 do servidor dedicado.

[ ] Todas as chamadas privadas validam o JWT descriptografando as propriedades appSlug e tenantId.

***

Esse documento garante que, seja qual for o próximo microsserviço que você criar, a estrutura de rede, Docker, segurança e banco de dados se manterá padronizada e modular, facilitando a manutenção e a escalabilidade.