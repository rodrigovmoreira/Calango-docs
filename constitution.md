# Constituição de Engenharia — Calango Inc.

> **Lei fundamental** de design, arquitetura e comportamento para todos os sistemas, microsserviços e aplicações do ecossistema **Calango** (incluindo as suítes Calango e Squamata).
>
> Tanto engenheiros humanos quanto Agentes de Inteligência Artificial **DEVEM** consultar e obedecer a estes princípios antes de projetar ou refatorar qualquer código.

---

## 1. Princípios Fundamentais (Norteadores)

### 🏠 Soberania de Infraestrutura (Self-Hosting First)

Nosso ecossistema é projetado para rodar **"em hardware de guerrilha"** (Home Lab/Servidor com sistemas Linux e containers Docker ou podman). Soluções locais têm prioridade absoluta. Evitamos ao máximo o *vendor lock-in (aprisionamento tecnológico)* de grandes provedores de nuvem. Se precisamos de um serviço na nuvem (como Storage), utilizamos protocolos abertos (como S3 via MinIO local).

### 🔒 Isolamento e Multi-Tenancy Inegociável

Todos os sistemas nascem para atender múltiplos clientes. O cruzamento de dados é a nossa falha mais crítica. **Toda** requisição, banco de dados e sessão deve carregar e validar o contexto de isolamento (`appSlug` e `tenantId`).

### 🧭 Pragmatismo na Stack

A simplicidade é nosso maior trunfo contra a dívida técnica, mas a eficiência de hardware dita as regras quando necessário.

---

## 2. Padrão de Stack Tecnológica

### ✅ Padrão Absoluto — Projetos criados do zero: JavaScript ESM

- **Backend:** Node.js com módulos ECMAScript (`import`/`export`).
- **Frontend:** React com Vite (`.jsx`).

O uso do JavaScript é o pilar principal da nossa arquitetura e deve ser ativamente encorajado e priorizado. A introdução de outras linguagens de compilação, supersets ou sistemas de módulos legados deve ser evitada em sistemas construídos do zero no ecossistema (ex: Calango Food, Calango Bot), garantindo a máxima padronização e fluidez de manutenção.

### 🔁 Exceção de Adoção — Sistemas Pré-Prontos e Frameworks

Ao adotar sistemas "pré-prontos" ou frameworks opinativos (como Payload CMS, painéis administrativos como o squamata-headless, etc.), é permitido utilizar a linguagem nativa exigida pela ferramenta.

> **A premissa é:** não lute contra a stack nativa da ferramenta, pois isso gera dívida técnica. Contudo, antes de introduzir uma ferramenta que exija uma linguagem diferente no ecossistema, deve-se avaliar criticamente se essa solução é realmente a melhor ou a única opção viável, visando evitar a pulverização desnecessária de tecnologias.

### ⚡ Exceção de Performance — Backend de Alta Carga: Golang

O uso de Go é autorizado e encorajado para microsserviços onde a eficiência e a redução agressiva de consumo de memória RAM sejam vitais para o Servidor (ex: workers pesados, roteadores de tráfego, ou processamento em massa).

### 🐍 Scripts e Automação Auxiliar — Python

Python pode ser utilizado exclusivamente para scripts isolados de manutenção, manipulação de dados em batch ou tarefas de infraestrutura que não exijam integração com o ecossistema web em tempo real.

### 🗄️ Persistência de Dados — MongoDB

O MongoDB é o banco de dados padrão para todo o ecossistema, rodando em instância dedicada na porta `27018`.

> Todos os serviços devem realizar conexões apontando para este servidor central.

---

## 3. O Que DEVE Ser Feito (The "Dos")

### ♻️ Design Orientado ao Reuso (Microservices First)

Todo novo módulo ou funcionalidade deve ser pensado primeiramente como um microsserviço independente e reutilizável. Antes de acoplar uma ideia a um sistema específico, avalie se ela pode ser útil para o restante do ecossistema. Encorajamos ativamente a extração de lógicas genéricas para que possam ser consumidas por qualquer aplicação da rede.

### 🧩 Reutilizar o Ecossistema

A arquitetura é modular por um motivo.

- **Autenticação?** Integre-se ao fluxo do Squamata-login (SSO).
- **Salvar imagens/arquivos?** Utilize o Squamata-upload apontando para o MinIO.
- **Gateway de pagamento ou CEP?** Use as APIs centrais do Squamata. **Nunca** recrie essas engrenagens dentro de projetos satélites.

### 🚨 Errar Rápido (Fail Fast)

Se um microsserviço não conseguir se conectar ao MongoDB ou se faltarem chaves obrigatórias no `.env`, o sistema deve quebrar (*crash*) imediatamente durante a inicialização (*boot*), relatando o erro no log. **Não** permita que sistemas rodem em estado zumbi.

### 🌐 Respeitar a Rede Global

Todo container Docker recém-criado deve obrigatoriamente conectar-se à rede externa `squamata-global` para interagir com o restante do ecossistema de forma segura.

---

## 4. O Que NUNCA Deve Ser Feito (The "Don'ts")

- 🚫 **Expor serviços internamente para a internet:** o acesso de fora da rede deve passar obrigatoriamente por nossos túneis de segurança (Cloudflare Tunnels) ou pelo API Gateway central. **Nunca** libere portas diretas no roteador ou firewall para serviços de backend.
- 🔑 **Comprometer segredos (*secrets*):** **nunca** deixe chaves, senhas, tokens ou credenciais em *hardcode* no código-fonte. Toda credencial deve ser lida de variáveis de ambiente (`process.env`) ou de um gerenciador de segredos dedicado.
- 📄 **Versionar o `.env`:** nenhum arquivo de ambiente (`.env`, `.env.*`, `.env.local`, etc.) pode ser commitado. Todo repositório deve declará-lo no `.gitignore` e, quando houver Docker, também no `.dockerignore`, garantindo que segredos nunca entrem no histórico do Git nem na imagem do container.
- 🧠 **Ignorar os limites de hardware:** nossos servidores são potentes, mas não infinitos.
  - Não faça requisições pesadas no banco de dados sem os devidos índices (*indexes*).
  - Não armazene arquivos densos (como Base64) dentro do banco de dados (use sempre o fluxo MinIO).
  - Preze por lógicas leves e eficientes de consumo de memória.
- 🕵️ **Permitir falhas de auditoria:** qualquer alteração sensível de estado ou tentativa de login deve gerar um log rastreável identificando **quem fez** (JWT/User) e **de onde veio** (`appSlug`).

---

## 5. Princípios Operacionais (Comunicação e Estabilidade)

### 🧊 Design Sem Estado (Statelessness)

Containers devem ser tratados como **entidades efêmeras**. Nenhuma aplicação deve armazenar estado de usuário, sessões em memória local ou uploads temporários dentro do próprio container. Qualquer dado que precise sobreviver a um *restart* deve ser imediatamente delegado ao banco de dados ou ao storage distribuído.

### 🛡️ Degradação Graciosa (Graceful Degradation)

Microsserviços **não** devem criar um efeito dominó de falhas. Se um serviço satélite (como o envio de mensagens do Bot) cair, o serviço principal (como o fechamento de carrinho no Food) deve continuar operando normalmente. A aplicação deve simplesmente registrar a falha do serviço secundário no log e seguir o fluxo crítico.

### 🔁 Idempotência nas Comunicações

Em sistemas distribuídos, falhas de rede acontecem e requisições são repetidas. As rotas que alteram dados (criação de pedidos, pagamentos, etc.) devem ser desenhadas para **não duplicar ações** se receberem o mesmo *payload* mais de uma vez.

### 📊 Observabilidade e Padronização de Logs

Erros silenciosos são o maior inimigo de uma arquitetura fragmentada. Todo log de erro gerado por um microsserviço deve seguir um padrão rastreável, informando de forma clara:

- **Qual** o serviço de origem;
- **Qual** a operação que falhou;
- **Chaves de contexto** obrigatórias, como `appSlug` ou `tenantId` afetado.