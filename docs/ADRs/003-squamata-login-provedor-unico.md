# ADR 003 — Squamata-Login como provedor único de identidade (SPOF aceito)

- **Status:** Aceito
- **Data:** 2026-10-28
- **Escopo:** Todos os serviços e aplicações do ecossistema Calango/Squamata

---

## Contexto

Cada aplicação (Calango-Bot, Calango-Food, marianos-meat) precisa autenticar usuários e conhecer o escopo de acesso (`appSlug`, `tenantId`). Havíamos chegado a um ponto em que o Calango-Bot ainda tinha login local (`/api/auth/login`, Passport/Google OAuth) enquanto o Calango-Food já delegava ao SSO — dois caminhos de autenticação, dois emissores possíveis de token e dois lugares para revogar acesso.

Duplicar autenticação tem custo conhecido: cada app precisa de hash de senha, fluxo de reset, verificação de e-mail, OAuth, revogação de sessão e auditoria. Multiplicar isso por N aplicações multiplica também a superfície de ataque e a chance de divergência de claim.

Ao mesmo tempo, centralizar cria um **ponto único de falha**: se o serviço de identidade cai, nenhuma aplicação autentica.

## Decisão

1. **Um único emissor de identidade:** `squamata-login`. Nenhuma aplicação cria login local, emite token próprio ou aceita token de outro emissor.
2. **Clientes apenas validam:** Calango-Bot, Calango-Food e marianos-meat verificam o JWT com o segredo compartilhado `JWT_SECRET_LOGIN`. A verificação é **local e stateless** — não há chamada por requisição ao login.
3. **SPOF é aceito conscientemente**, com mitigação operacional em vez de fallback funcional:
   - ordem obrigatória de subida (login primeiro) e de parada (login por último);
   - healthcheck obrigatório em `/api/v1/health`, consumido pelo healthcheck do container;
   - diagnóstico de 401 em cascata começa no login;
   - `JWT_SECRET_LOGIN` idêntico e sem valor default hardcoded.
4. **Sem login local de contingência.** Falha do login é tratada como incidente de plataforma, nunca contornada com mock, token fixo ou segredo alternativo.

## Alternativas consideradas

| Alternativa | Por que foi recusada |
| --- | --- |
| **Login local em cada app** (como o legado do Calango-Bot) | N emissores, N fluxos de reset/OAuth, revogação descentralizada, auditoria fragmentada. Foi justamente o estado anterior que motivou a consolidação. |
| **Fallback local quando o SSO está fora** | Recria o problema acima e cria uma janela em que credenciais circulam por um caminho não auditado. Também impede garantir a flag `isActive`. |
| **Token de serviço compartilhado com expiração longa** como contingência | Transforma indisponibilidade de login em risco permanente de credencial estática; piora a postura de segurança. |
| **Réplica ativa-ativa do login** | Resolve disponibilidade, mas exige estado compartilhado de sessão/refresh e coordenação de chaves. Desproporcional ao porte atual do ecossistema. |

## Consequências

### Positivas

- Um só lugar para autenticar, revogar, auditar e evoluir o contrato de token.
- Onboarding de nova aplicação fica trivial: validar JWT com o segredo compartilhado.
- Flag `isActive` (kill-switch) e `AuditLog` centralizados.
- Validação stateless: o custo por requisição não cresce com o número de clientes.

### Negativas / custos assumidos

- **Disponibilidade acoplada:** login fora do ar = nenhum login novo em nenhum app.
- **Acoplamento de contrato:** mudar claims, `appSlug`, `tenantId` ou expiração exige atualizar todos os consumidores juntos.
- **Segredo compartilhado:** `JWT_SECRET_LOGIN` passa a ser material crítico. Divergência entre serviços ou fallback hardcoded quebra a garantia de identidade em silêncio.

### O que **não** quebra quando o login cai

Tokens já emitidos continuam válidos até expirar, porque a validação é local. O que cessa é a **emissão de novos tokens** e qualquer fluxo de refresh/OAuth/callback. Isso precisa estar claro em qualquer diagnóstico: um usuário logado pode continuar navegando; um usuário novo não consegue entrar.

## Como remover o SPOF no futuro

Se a disponibilidade de login se tornar um requisito formal:

1. Introduzir réplica do serviço com chave de assinatura compartilhada (JWT stateless já permite isso sem estado compartilhado de sessão).
2. Considerar rotação de chave com `kid` no header do token, permitindo múltiplas chaves válidas durante a transição.
3. Só então avaliar refresh token com estado — e, nesse caso, o estado passa a ser a nova dependência crítica.

Nenhuma dessas etapas autoriza login local nos clientes.

## Referências

- [Architecture.md §1.1](../Architecture.md) — dependências críticas, camadas e ordem de subida.
- [constitution.md](../../constitution.md) — "Serviços Centrais são SPOF Declarado".
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — regras always-on para agentes.
- [ADR 002](./002-versionamento-de-api.md) — healthcheck padronizado usado no monitoramento do login.
