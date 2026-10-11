# Especificação de Arquitetura e Infraestrutura Padrão — Calango Inc.

Este documento estabelece as diretrizes de engenharia de software, padrões de código e a topologia de infraestrutura para o ecossistema de microsserviços **Squamata** e as aplicações integradas.

Qualquer novo módulo, bot, API ou interface gráfica a ser desenvolvida neste ecossistema **DEVE** seguir rigorosamente as especificações descritas neste documento.

---

## 1. Visão Geral da Arquitetura

O ecossistema baseia-se em uma arquitetura de **Microsserviços Desacoplados**, projetada para garantir escalabilidade horizontal leve e isolamento de falhas dentro de um ambiente auto-hospedado.
A espinha dorsal de segurança do sistema é o **Squamata-login**, um provedor de identidade centralizado que opera sob o modelo **Single Sign-On (SSO)**. As aplicações clientes delegam a autenticação para este microsserviço, que emite tokens criptografados baseados no escopo de acesso do usuário.

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