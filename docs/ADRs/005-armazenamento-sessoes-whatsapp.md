# ADR 005 — Armazenamento de estado das sessões do `squamata-whatsapp`

- **Status:** Aceito
- **Data:** 2026-10-29
- **Escopo:** Novo microsserviço `squamata-whatsapp` (conexão de WhatsApp via Go + `whatsmeow`)
- **Relacionado:** [ADR 002](./002-versionamento-de-api.md) (contrato HTTP), [ADR 003](./003-squamata-login-provedor-unico.md) (camadas e SPOF)

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

1. **Dialeto:** SQLite do `store/sqlstore` (`dbutil` suporta `sqlite3`/`sqlite` e `postgres`, com migrações por dialeto via `-- only: sqlite`). Preferir o driver **puro Go** (`modernc.org/sqlite`) para manter a imagem Docker sem CGO; validar o identificador exato de dialeto aceito pelo `sqlstore` no spike da F0.
2. **Um arquivo para todas as sessões.** O `sqlstore` chaveia as tabelas por dispositivo, então N sessões convivem no mesmo banco — não é um arquivo por sessão.
3. **Volume persistente** montado no container (`/data`), com o arquivo fora da camada de escrita da imagem.
4. **Modo WAL + `busy_timeout`**, para leitura concorrente durante escrita sem `database is locked`.
5. **Nenhum servidor de banco novo.** SQLite é uma biblioteca, não um processo.
6. **Nada de estado de sessão no MongoDB.** O Calango-bot guarda apenas o `sessionId` (string opaca); metadados como nome, tenant e proprietário vivem no próprio SQLite do serviço.
7. **Proibido implementar store próprio sobre Mongo/Redis/Badger.** Ver alternativas.

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

## Consequências

### Positivas

- **Zero servidor de banco novo.** O `squamata-whatsapp` continua sendo um único container + um volume — mesma complexidade operacional do `squamata-cep`.
- **Backup é cópia de arquivo** (`VACUUM INTO` ou snapshot do volume), sem dump lógico nem ferramenta de terceiros.
- **Ambiente de teste trivial:** `:memory:` ou um arquivo temporário; os testes não dependem de infraestrutura externa.
- **Usa a implementação oficial e mantida** do store, com o sistema de migração do `dbutil` (`Container.Upgrade`).
- **Sem CGO na imagem** (com driver puro Go), permitindo base `distroless`/`scratch` — imagem muito menor que a atual, que carrega Chromium.

### Negativas / custos assumidos

- **Single-node por definição.** Se um dia precisarmos de várias réplicas, a divisão será por *sharding* de sessão (cada réplica com seu arquivo), não por banco compartilhado. Isso é compatível com o contrato HTTP — muda apenas o roteamento.
- **Escrita serializada.** Irrelevante para o volume esperado (pareamento e envio são pontuais, não um fluxo de alta frequência), mas é uma característica real.
- **Sem point-in-time recovery nativo.** Mitigado por snapshot periódico do arquivo; o pior cenário é reparear as sessões, que é um QR.
- **Migração para Postgres, se necessária, é manual.** As tabelas do `sqlstore` são SQL genérico e o `dbutil` já tem sintaxe por dialeto, então é um dump/restore — porém **não** é uma ferramenta pronta. **Não é bloqueante**: com dezenas de sessões, o caminho alternativo é reparear.

## Implementação

```
squamata-whatsapp/
  docker-compose.yml      → serviço + volume nomeado (whatsapp-data:/data)
  /data/whatsapp.db       → store do sqlstore (fora da imagem)
```

- DSN (ajustar ao driver escolhido na F0); forma esperada com driver puro Go:
  `file:/data/whatsapp.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)`
- `GET /api/v1/health` deve reportar **também** a saúde do store (arquivo acessível e `Container.Upgrade` aplicado), não só "processo vivo".
- **Backup:** `VACUUM INTO '/data/backup-<timestamp>.db'` agendado, ou snapshot do volume no host.
- **Teste de aceite obrigatório na F2:** parear uma sessão, **reiniciar o container**, e confirmar que a sessão continua autenticada. É o teste que prova que a decisão está certa.

## Quando revisar esta decisão

Revisar (nova ADR) se qualquer um destes ocorrer:

1. Necessidade real de **duas ou mais réplicas atendendo o mesmo conjunto de sessões** (hoje impossível por natureza).
2. Volume de sessões que torne o arquivo único operacionalmente desconfortável para backup (ordem de centenas).
3. Exigência de **PITR** ou auditoria de acesso ao banco por compliance.
4. Alguma sessão passando a ser escrita por mais de um processo.
