# ADR 004 — Vínculo usuário ↔ empresa, convites e offboarding

- **Status:** Aceito
- **Data:** 2026-10-28
- **Escopo:** Calango-Bot e aplicações satélites com multi-tenancy por empresa

---

## Contexto

Um mesmo e-mail pode trabalhar em várias empresas do SaaS. Precisávamos definir: como o usuário entra em cada empresa, como perde acesso, e o que acontece com o histórico quando isso ocorre.

Antes desta decisão o sistema tinha três problemas:

1. **Não existia offboarding.** Não havia rota para tirar o acesso de alguém; e mesmo removendo do array, o `activeBusinessId` continuava apontando para a empresa, então a pessoa seguia acessando com o papel default `operator`.
2. **`isActive` no `SystemUser` é global.** Usá-lo para revogar acesso a uma empresa derrubaria o usuário em **todas** — inclusive na empresa que é dele.
3. **Provisionamento automático ressuscitava acesso.** Qualquer usuário com `businesses` vazio ganhava uma empresa nova no request seguinte, desfazendo qualquer remoção.

## Decisão

### 1. O vínculo é a unidade de acesso, não o usuário

O acesso a uma empresa é representado por um item em `SystemUser.businesses`:

```js
{
  businessId, role,          // quem, onde, com que papel
  status,                    // 'active' | 'inactive'  (ausente = ativo, por compatibilidade)
  deactivatedAt,             // quando foi inativado
  deactivatedBy              // quem inativou (auditoria)
}
```

O `activeBusinessId` é apenas **o contexto atual**, não a autorização. A autorização é sempre verificada contra os vínculos **ativos** a cada requisição.

### 2. Onboarding

| Situação | Resultado |
| :--- | :--- |
| Primeiro acesso SSO (usuário novo) | Cria `BusinessConfig` própria e vínculo **admin** |
| Criar empresa pela interface | Novo `BusinessConfig` + vínculo **admin** na nova empresa |
| Entrar em empresa de terceiros | **Somente por convite**; o papel é definido pelo admin no convite (padrão `operator`) |
| Convite para quem já foi inativado | **Reativa** o vínculo existente (preserva o histórico) |

Regra: a empresa criada pela própria pessoa a torna **admin**. Acesso a empresa alheia depende de convite, e o papel vem do convite.

### 3. Offboarding é sempre soft delete

Inativar um vínculo **nunca** apaga o documento nem remove o item do array. Marca-se `status: 'inactive'` + `deactivatedAt` + `deactivatedBy`. O item permanece como histórico de que a pessoa passou por aquela empresa.

**Nunca** alterar `isActive` do usuário para revogar acesso a uma empresa — o campo é global e o deixaria fora do próprio negócio.

### 4. Proteção contra lockout

- Ninguém pode inativar o próprio acesso.
- A rota exige `requireAdmin`.
- Existe uma guarda adicional de "último admin" (`code: 'LAST_ADMIN'`). Ela é **rede de segurança**: como só um admin pode chamar a rota, o ator é sempre um admin ativo, então na prática nunca há apenas 1 admin ativo no momento da chamada. A proteção real contra lockout é a proibição de auto-inativação.

### 5. Herança de leads

Ao inativar, todos os contatos com `assignedTo = inativado` naquela empresa passam para um **herdeiro**, na mesma operação:

- o herdeiro padrão é o **admin que executou** a ação;
- o admin pode **escolher outro membro ativo** enviando `transferTo` no corpo da requisição (interface de desligamento, Roadmap 1 Ponto 6.4);
- destino inválido — sem vínculo ativo na empresa, ou o próprio inativado — retorna `400 INVALID_TRANSFER_TARGET`.

O endpoint devolve `transferredLeads` e `transferredTo` para a UI confirmar. Existe também `POST /api/v1/contacts/bulk-transfer` (`requireAdmin`) para redistribuir leads **sem** desligar ninguém — mesma validação de vínculo ativo no destino.

Agendamentos **não** são herdados automaticamente: transferir uma agenda inteira pode entregar horários a alguém indisponível. É uma decisão operacional do admin, não um efeito colateral de desligamento.

### 6. Ciclo de vida da conta

- A empresa da qual a pessoa é admin **só desaparece** se ela **apagar a conta**.
- A conta **só pode ser apagada** se a pessoa **não estiver vinculada a nenhuma outra empresa**.
- Apagar a conta também é soft delete (histórico preservado).

### 7. Identidade e histórico

O **`_id` do `SystemUser` é a identidade**. O e-mail é chave de login, não de identidade histórica. Vínculos inativos continuam ligados ao mesmo `_id`, o que preserva "por onde a pessoa passou".

**Decisão sobre e-mail (confirmada em 2026-10-28):** o e-mail permanece **único**. Um novo cadastro com o mesmo e-mail **reaproveita o mesmo `_id`** em vez de criar um novo. Motivo: permitir múltiplos usuários com o mesmo e-mail quebraria a busca do SSO (`findOne({ email })`) e a unicidade do login. O histórico não depende de IDs duplicados — ele vive nos **vínculos** (`businesses[]`), que registram cada empresa por onde a pessoa passou, com papel, status e datas.

## Alternativas consideradas

| Alternativa | Por que foi recusada |
| :--- | :--- |
| **`isActive` global por empresa** | Um campo global não consegue expressar "inativo aqui, ativo ali". Derrubaria a pessoa do próprio negócio. |
| **Remover fisicamente o item de `businesses`** | Perde o histórico de vínculos, que é exatamente o que a auditoria precisa. |
| **Coleção `Membership` separada** | Modelo mais correto a longo prazo (permite histórico de convites, permissões granulares, N:N com metadados). Recusado **agora** por custo de migração; os campos já foram desenhados para caber nessa evolução. |
| **Conta por e-mail (sem `_id` estável)** | Torna impossível distinguir "mesma pessoa voltou" de "outra pessoa", e quebra o SSO. |

## Práticas de mercado que embasam esta decisão

- **Desativar e reatribuir** (Salesforce, HubSpot): ao desligar um usuário, os registros de propriedade dele são transferidos na mesma operação — é o padrão de mercado para não deixar leads órfãos.
- **Soft delete com `status` + `deactivatedAt`/`deactivatedBy`**: abordagem usual para preservar histórico sem apagar (equivalente ao `deleted_at` do Rails e ao `deletedAt` do Prisma).
- **Guardar o último administrador / owner**: prática padrão em sistemas multi-tenant (GitHub, Slack, Google Workspace impedem remover o último owner).
- **Identidade por ID imutável, e-mail como atributo de login** (modelo SCIM/Okta): evita que troca de e-mail crie uma pessoa nova.
- **Auditoria append-only** (Ponto 5 do roadmap): complementa este ADR; hoje só o offboarding grava `deactivatedBy`.

## Consequências

### Positivas

- Revogação de acesso efetiva e imediata, sem apagar histórico.
- Zero risco de lockout acidental da empresa.
- Leads nunca ficam órfãos após um desligamento.
- Mesmo modelo serve para "suspender temporariamente" (reativar via novo convite).

### Negativas / custos assumidos

- Toda leitura de vínculo precisa considerar `status` (vínculos antigos sem o campo são tratados como ativos — regra em `utils/membership.js`).
- A UI de equipe **ainda não lista vínculos inativos**: `/business/team` devolve apenas ativos. O histórico existe no banco mas não é navegável pela tela.
- `deactivatedBy`/`deactivatedAt` registram o offboarding; a autoria das demais escritas vem do plugin de auditoria (Roadmap 1, Ponto 5).

## Implementação

- `backend/utils/membership.js` — regras compartilhadas (`isActiveMembership`, `activeMemberships`, `formatBusinesses`, `activeMembershipQuery`).
- `backend/middleware/auth.js` — resolve contexto e papel apenas entre vínculos ativos; bloqueia com `403 NO_ACTIVE_BUSINESS` quando não há nenhum.
- `PATCH /api/v1/business/team/:userId/deactivate` — offboarding (admin-only), com `transferTo` opcional.
- `GET /api/v1/business/team/:userId/lead-count` — contagem de leads para o modal de desligamento (admin-only).
- `POST /api/v1/contacts/bulk-transfer` — redistribuição avulsa de leads entre membros (admin-only).
- `POST /api/v1/auth/accept-invite` — cria ou **reativa** o vínculo.
- `backend/utils/auditPlugin.js` + `backend/utils/auditContext.js` — autoria (`createdBy`/`lastUpdatedBy`) em Contact, Appointment e BusinessConfig.
