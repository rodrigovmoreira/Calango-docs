# ADR 005 — Armazenamento de estado das sessões do `squamata-whatsapp`

- **Status:** Aceito
- **Data:** 2026-10-29
- **Escopo:** Novo microsserviço `squamata-whatsapp` (conexão de WhatsApp via Go + `whatsmeow`)
- **Relacionado:** [ADR 002](./002-versionamento-de-api.md) (contrato HTTP), [ADR 003](./003-squamata-login-provedor-unico.md) (camadas e SPOF), [Architecture.md §5](../Architecture.md) (Dockerfile multi-stage e rede `squamata-global`)

---

## Contexto

O `squamata-whatsapp` vai substituir o `whatsapp-web.js` embutido no Calango-bot por um microsserviço em Go usando [`whatsmeow`](https://github.com/tulir/whatsmeow).

O `whatsmeow` **exige persistência** de estado que não é "dado de sessão" no sentido usual: é **estado criptográfico do protocolo Signal** — identity keys, pre-keys, signed pre-keys, sender keys, sessões por dispositivo remoto e MACs de mutação de *app state*. Sem persistir isso, cada reinício do processo significa **parear o número de novo**.

Três forças em tensão:

1. O ecossistema Calango/Squamata **já opera MongoDB**; adicionar um servidor de banco novo tem custo operacional (backup, monitoramento, credenciais, ordem de subida).
2. A biblioteca **não tem adapter MongoDB**: a implementação pronta (`store/sqlstore`) é exclusivamente SQL.
3. Uma sessão de WhatsApp é **stateful e presa ao processo** — o `Client` do `whatsmeow` vive na memória de um processo específico, então réplicas atrás de um load balancer não distribuem sessões.

## Decisão

**Usar SQLite embarcado, como arquivo em volume persistente, através do `sqlstore` oficial.**

1. **Dialeto:** SQLite do `store/sqlstore`, através do driver de **Go puro** `modernc.org/sqlite`. Ponto já validado no spike da F0 — não é mais hipótese: o driver registra o nome `sqlite`, mas o `dbutil` só reconhece o dialeto `sqlite3`, então o store é criado com `sqlstore.NewWithDB(db, "sqlite3", ...)` e `Container.Upgrade` é chamado explicitamente. (`sqlstore.New` abriria o banco usando o rótulo de dialeto como nome de driver, e não existe driver registrado como `sqlite3`.) Evidência: `go test ./internal/store` em Windows com `CGO_ENABLED=0`, sem `gcc` instalado — abre, migra (`whatsmeow_device` presente), `PRAGMA journal_mode` = `wal`, `PRAGMA foreign_keys` = `1`, e reabre o mesmo arquivo sem reparear.
2. **Um arquivo para todas as sessões.** O `sqlstore` chaveia as tabelas por dispositivo, então N sessões convivem no mesmo banco — não é um arquivo por sessão.
3. **Volume persistente** montado no container (`/data`), com o arquivo fora da camada de escrita da imagem.
4. **Modo WAL + `busy_timeout`**, para leitura concorrente durante escrita sem `database is locked`.
5. **Nenhum servidor de banco novo.** SQLite é uma biblioteca, não um processo.
6. **Nada de estado de sessão no MongoDB.** O Calango-bot guarda apenas o `sessionId` (string opaca); metadados como nome, tenant e proprietário vivem no próprio SQLite do serviço.
7. **Proibido implementar store próprio sobre Mongo/Redis/Badger.** Ver alternativas.
8. **Desenvolvimento é nativo; Docker é exclusivo de produção.** Dev roda `go run`/`go test` direto no host — Windows ou Linux —, sem container. Docker entra apenas no Fedora server, para entregar binário reprodutível, imagem mínima, healthcheck, política de restart e o volume `/data`. Nenhuma tarefa de desenvolvimento depende de `docker compose`. Detalhes: [Ambientes](#ambientes).
9. **O host de produção não precisa de toolchain Go.** O compilador vive no estágio de build da imagem; instalar Go no servidor criaria uma segunda toolchain, possivelmente divergente da fixada no `Dockerfile`.

## Alternativas consideradas

| Alternativa | Por que foi recusada |
| --- | --- |
| **Postgres/MySQL dedicado** | Resolveria multi-réplica — benefício **ilusório** aqui, porque a sessão está pinada ao processo. Custo real: mais um servidor (backup, monitoramento, credenciais, ordem de subida) para um serviço que faz poucas escritas por minuto. |
| **Implementar `store.Device`/`AllStores` sobre MongoDB** | Tecnicamente possível (`store.Device` expõe `SetAllStores`), mas **não existe adapter mantido** (busca de repositórios no GitHub: 0 resultados). Seriam ~20 métodos de estado criptográfico do Signal mantidos por nós. Um bug não gera tela quebrada: gera **mensagem que não decifra**, com diagnóstico opaco. Não é reaproveitar infra — é assumir a parte mais delicada da biblioteca. |
| **SQLite em memória (`:memory:`)** | Aceitável **apenas** para spike/dev. Perder as chaves a cada reinício significa reparear; inaceitável em produção. |
| **Mongo para metadados + SQLite para cripto** | Dois stores para a mesma entidade, com risco de divergência e transação distribuída entre eles. Recusado. |
| **SQLite por sessão (N arquivos)** | Sem ganho: o `sqlstore` já isola por dispositivo dentro de um arquivo. Multiplicaria o número de arquivos a fazer backup. |

## Práticas de mercado que embasam esta decisão

- **SQLite é o padrão de agentes stateful single-node**: é o formato de estado de Home Assistant, Grafana, Jellyfin, e da maioria dos bots e agentes self-hosted. O critério de escolha é sempre "um processo é o dono do estado?".
- **Postgres é escolhido quando há múltiplas réplicas concorrentes escrevendo** — condição que um serviço de conexão de WhatsApp não satisfaz.
- **Estado criptográfico de protocolo de mensageria deve usar a implementação oficial da biblioteca**: é a recomendação implícita do próprio `whatsmeow` ao manter `sqlstore` como único store pronto. Reimplementar a camada de chaves é a categoria de risco que se evita por padrão.
- **MongoDB não é indicado para armazenar chaves de curta vida com semântica transacional de contadores** (pre-keys consumidas uma única vez, sender keys rotativas): a garantia de "consumir exatamente uma vez" é mais natural em SQL transacional.
- **Dev nativo e imagem multi-stage no deploy é o padrão de serviços Go:** `go run` no ciclo de desenvolvimento, `golang:...` → `distroless`/`scratch` no deploy. Compilar no host e copiar o binário é a exceção (cross-compile), não a regra.

## Consequências

### Positivas

- **Zero servidor de banco novo.** O `squamata-whatsapp` continua sendo um único container + um volume — mesma complexidade operacional do `squamata-cep`.
- **Backup é cópia de arquivo** (`VACUUM INTO` ou snapshot do volume), sem dump lógico nem ferramenta de terceiros.
- **Ambiente de teste trivial:** `:memory:` ou um arquivo temporário; os testes não dependem de infraestrutura externa.
- **Usa a implementação oficial e mantida** do store, com o sistema de migração do `dbutil` (`Container.Upgrade`).
- **Sem CGO na imagem** (com driver puro Go), permitindo base `distroless`/`scratch` — imagem muito menor que a atual, que carrega Chromium.
- **Dev sem Docker em Windows e Linux.** Um `go run` sobe o serviço: não há imagem para construir, volume para montar nem rede para anexar durante o desenvolvimento.

### Negativas / custos assumidos

- **Single-node por definição.** Se um dia precisarmos de várias réplicas, a divisão será por *sharding* de sessão (cada réplica com seu arquivo), não por banco compartilhado. Isso é compatível com o contrato HTTP — muda apenas o roteamento.
- **Escrita serializada.** Irrelevante para o volume esperado (pareamento e envio são pontuais, não um fluxo de alta frequência), mas é uma característica real.
- **Sem point-in-time recovery nativo.** Mitigado por snapshot periódico do arquivo; o pior cenário é reparear as sessões, que é um QR.
- **Migração para Postgres, se necessária, é manual.** As tabelas do `sqlstore` são SQL genérico e o `dbutil` já tem sintaxe por dialeto, então é um dump/restore — porém **não** é uma ferramenta pronta. **Não é bloqueante**: com dezenas de sessões, o caminho alternativo é reparear.
- **Duas formas de rodar (nativo e container).** O caminho de produção — volume `/data`, imagem distroless, healthcheck do compose — **não** é exercitado pelo dev. Mitigação: o teste de aceite da F2 (parear, reiniciar o container, continuar autenticado) roda no container, e o `docker build` acontece no servidor antes de subir.

### Compatibilidade com "container efêmero"

O `constitution.md` exige containers efêmeros e proíbe estado na camada de escrita. Esta decisão **não** viola isso: o arquivo SQLite fica em volume externo à imagem, então o container pode ser destruído e recriado sem perda. O que a regra proíbe — estado dentro do container — não acontece; o estado é um banco externo, tal como o MinIO é o armazenamento externo de arquivos. A única diferença de tratamento é que, aqui, o "servidor de banco" é um arquivo.

## Implementação

### Ambientes

Docker **não** é requisito de desenvolvimento: existe só no servidor de produção. O código é o mesmo nos três ambientes; muda quem compila e onde o arquivo SQLite fica.

| Ambiente | Como roda | Instalado no host | `SQUAMATA_WHATSAPP_DB_PATH` |
| --- | --- | --- | --- |
| **Windows** (PC de dev) | `go run ./cmd/squamata-whatsapp` nativo | **Go ≥ 1.26** e nada mais | `./data/whatsapp.db` (default do código) |
| **Linux** (dev) | idem, nativo | **Go ≥ 1.26** e nada mais | `./data/whatsapp.db` |
| **Fedora server** (produção) | container a partir da imagem multi-stage | **Docker (ou podman) apenas — Go não é necessário** | `/data/whatsapp.db` (volume) |

O piso do Go é **1.26**, não uma preferência: a revisão atual do `whatsmeow` declara `go 1.26.0`, e o `go.mod` acompanha. Em dev, `go version` precisa ser ≥ 1.26; em produção, irrelevante — lá quem compila é a imagem.

**Precisa instalar Go no Fedora server? Não.** O compilador Go vive no *estágio de build* da imagem (`golang:<versão>`), não no host: quem executa `docker compose build/up` só precisa do daemon de containers. Instalar Go no servidor teria efeito contrário ao desejado — passaria a existir uma segunda toolchain, com versão possivelmente diferente da fixada no `Dockerfile`, produzindo binários não reprodutíveis. A versão de produção é a do `Dockerfile`; a do host de dev é conveniência.

**Compilador C não é necessário em lugar nenhum.** O driver é Go puro, então `CGO_ENABLED=0` vale nos três ambientes: sem `gcc`/MinGW no Windows, sem `gcc`/`build-essential` no Fedora. Se o spike tivesse caído no `mattn/go-sqlite3` (CGO), o compilador C apareceria **só** na imagem de build — mas o dev nativo no Windows passaria a exigir MinGW. É mais um argumento a favor do item 1.

### Desenvolvimento (sem Docker)

O serviço lê `os.Getenv`: **não** carrega `.env` sozinho (quem injeta `.env` é o compose, via `env_file`). Em dev nativo, exporte no shell:

```powershell
# Windows (PowerShell)
$env:SQUAMATA_INTERNAL_TOKEN = "dev"
$env:SQUAMATA_WHATSAPP_DB_PATH = "./data/whatsapp.db"
go run ./cmd/squamata-whatsapp
```

```bash
# Linux (dev)
export SQUAMATA_INTERNAL_TOKEN=dev
export SQUAMATA_WHATSAPP_DB_PATH=./data/whatsapp.db
go run ./cmd/squamata-whatsapp
```

- `Dockerfile` e `docker-compose.yml` **não** são usados em dev; nenhuma tarefa de desenvolvimento pode depender de `docker compose`.
- `.env.example` documenta o conjunto de variáveis; produção injeta por `env_file`/`environment` no compose.
- Os defaults do código já são de dev (`./data/whatsapp.db`, porta `3006`); produção sobrescreve por variável de ambiente, nunca invertendo isso.
- Testes rodam iguais nos dois SOs (`go test ./...`), sempre com `t.TempDir()` para o banco — nunca caminho fixo como `/tmp` ou `C:\temp`.
- `SQUAMATA_INTERNAL_TOKEN` continua obrigatório em dev: sem ele o processo não sobe (Fail Fast). Valor local qualquer; nunca o de produção.

### Produção (container)

```
Squamata-whatsapp/
  Dockerfile              → multi-stage: golang (build) → distroless/static (runtime)
  docker-compose.yml      → serviço + volume nomeado (whatsapp-data:/data) + rede squamata-global
  /data/whatsapp.db       → store do sqlstore, fora da imagem
```

- Imagem final sem Go, sem shell e sem CGO: só o binário estático (`CGO_ENABLED=0`, `-trimpath`, `-ldflags "-s -w"`). Padrão de referência: [Architecture.md §5.1](../Architecture.md).
- O build acontece **no servidor** (`docker compose build`), que baixa a imagem oficial do Go como *build stage*. Compilar no Windows e copiar o binário reintroduziria a divergência de toolchain que o item 8 evita.
- `docker-compose.yml` segue [Architecture.md §5.2](../Architecture.md): rede externa `squamata-global`, `restart: unless-stopped` e healthcheck em `/api/v1/health`.

### Regras de portabilidade (Windows ↔ Linux)

O mesmo código roda em NTFS e em ext4. Estas regras existem para que a diferença não apareça em produção:

1. **Caminho sempre por variável de ambiente**, convertido com `filepath.ToSlash` antes de virar DSN: `file:C:\...` não é URI válida, `file:C:/...` é. Já aplicado em `internal/store/store.go`.
2. **DSN no formato** `file:<caminho-com-barras>?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)`. `foreign_keys(1)` é obrigatório — `Container.Upgrade` aborta com "foreign keys are not enabled".
3. **`SetMaxOpenConns(1)`**: a semântica de *file locking* difere entre Windows e Linux. Serializar o pool elimina a diferença e dispensa retry de `database is locked`.
4. **Nunca** apontar o banco para pasta sincronizada (OneDrive, Google Drive) ou share SMB/NFS. No Windows o perfil costuma ter "Documentos" redirecionado para OneDrive, e WAL + *locking* sobre sincronização ou rede corrompem o arquivo. Em dev: disco local.
5. **Backup é `VACUUM INTO`, nunca cópia do arquivo em uso.** Cópia "a quente" não é backup consistente em nenhum dos dois SOs e, no Windows, ainda esbarra no *lock* do arquivo aberto.
6. **Nada de caminho absoluto hardcoded** (`/data`, `C:\data`): `/data/whatsapp.db` é a montagem do volume em produção, não um default do código.

### Contrato operacional

- `GET /api/v1/health` reporta **também** a saúde do store, não só "processo vivo": `SELECT 1` **e** contagem em `whatsmeow_device` — um `SELECT 1` sozinho passaria mesmo com as migrações ausentes.
- **Backup:** `VACUUM INTO '/data/backup-<timestamp>.db'` agendado, ou snapshot do volume no host.
- **Teste de aceite obrigatório na F2:** parear uma sessão, **reiniciar o container** e confirmar que ela continua autenticada. É o teste que prova a decisão e o único que exercita o caminho de produção (volume + imagem + build), já que em dev tudo roda nativo.

## Quando revisar esta decisão

Revisar (nova ADR) se qualquer um destes ocorrer:

1. Necessidade real de **duas ou mais réplicas atendendo o mesmo conjunto de sessões** (hoje impossível por natureza).
2. Volume de sessões que torne o arquivo único operacionalmente desconfortável para backup (ordem de centenas).
3. Exigência de **PITR** ou auditoria de acesso ao banco por compliance.
4. Alguma sessão passando a ser escrita por mais de um processo.
