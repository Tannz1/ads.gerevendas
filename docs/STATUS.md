# Status do GereVendas Ads

Atualizado em 17/10/2026. Legenda: **REAL** (funciona com persistência real), **MOCK** (simulação
rotulada), **BLOQUEADO** (depende de decisão ou acesso externo), **PRÓXIMO** (ainda não existe código).

Os documentos 03 e 06 citam um monorepo (`apps/web`, `packages/contracts`). O código é um app
Next.js único (ADR 0001): `apps/web` corresponde a `src/app`, `packages/contracts` a `src/contracts`.

## Ambiente

| Item | Situação |
| --- | --- |
| Produção | `https://signal-crm-staging-ads.onv9zt.easypanel.host/ads` (EasyPanel, projeto `signal-crm-staging`, serviço `ads`), em modo demonstração |
| CI (GitHub Actions) | Lint, tipos, unitários, build, migrations + RLS em Postgres, E2E na raiz e em `/ads` |
| Supabase local | **REAL**: `npx supabase start`; login, empresa, onboarding e isolamento validados por `tests/e2e/real.spec.ts`; 29 testes de RLS passam no Postgres do Supabase |
| Supabase do Ads em nuvem | **BLOQUEADO**: projeto exclusivo ainda não criado; produção segue em modo demonstração |
| Domínio `gerevendas.com.br/ads` | **BLOQUEADO**: o domínio está na Hostinger, não na VPS; precisa de rewrite lá ou de subdomínio apontado para a VPS |
| Deploy automático | **BLOQUEADO**: EasyPanel sem token do GitHub (Settings → GitHub) |
| Limite de CPU/memória do serviço | Pendente: aplicar no EasyPanel para não disputar recursos com o CRM |

## Milestones (docs/06)

### M0 — Discovery + spike Meta: adiado por decisão do produto (ADR 0002)
- Inventário read-only do CRM: **PRÓXIMO** (`CRM_INTEGRATION_PENDING`).
- App Meta de teste, OAuth e criação PAUSED em conta autorizada: **BLOQUEADO** (precisa de app Meta e conta autorizada).

### M1 — Fundação: validada no Supabase local; produção aguarda Supabase em nuvem
- Landing, login por link mágico, shell, início, conta, 404/erro em pt-BR: **REAL**, validado no Supabase local.
- Organizações, membros (`owner`/`admin`/`member`), auditoria, RLS: **REAL** no banco, 29 testes de isolamento no CI.
- Onboarding em 6 etapas com autosave e conclusão idempotente: **REAL** com Supabase; **MOCK** (navegador) no modo demo.
- Gate "login, 2 orgs isoladas, onboarding persistido": **REAL no Supabase local** (E2E `real.spec.ts`). Em produção, depende do Supabase em nuvem.
- Lacunas frente ao PRD: upload de logo e fotos autorizadas (Storage privado), papel `support` auditado,
  convites (`/invite/[token]`), termos e consentimentos, exportação e exclusão de dados (LGPD): **PRÓXIMO**.

### M2 — Estratégia e criativos: concluído no Supabase local (spec `docs/superpowers/specs/2026-10-17-criativos-design.md`, ADR 0003)
- Subprojeto 1, estratégia + 5 peças + editor + aprovação + PNG 1080×1350/1080×1920: **REAL** no Supabase
  local (E2E `real.spec.ts`, 23 testes de RLS). Sem chave da OpenAI roda o provedor **MOCK** rotulado Simulação.
- Provedor de texto OpenAI (Responses API, JSON Schema estrito): **REAL**, validado em 17/10/2026 com
  `gpt-6-sol` (527 + 1.021 tokens, ~US$ 0,011 e 12 s por estratégia; passou na checagem de fatos).
- Subprojeto 2, imagem de fundo: foto do cliente (JPG/PNG até 5 MB, conferida pelos bytes, com declaração de
  direito de uso) **REAL** no Supabase local (Storage privado com RLS por pasta, E2E). Geração com OpenAI Images
  (`gpt-image-2.5-flare`, qualidade `medium`): **REAL**, validada em 17/10/2026 (JPEG 1024×1536, ~200 KB, 8 s,
  sem texto na imagem).
- Subprojeto 3, créditos e limites: **REAL** no Supabase local. Ledger só de inserção (reserva → consumo |
  devolução, idempotente por job), 4 estratégias e 20 imagens com IA por mês (fuso de São Paulo), simulação não
  consome, teto de tokens de texto por empresa (`AI_MONTHLY_TOKEN_CAP`), medidor em Criativos. 18 testes de RLS.
- Pendências do M2: avaliação com o conjunto fixo de briefs (docs/04) e revisão humana de 10% no piloto;
  medir o custo por imagem na fatura da OpenAI (a página de preços só informa por token).

### M3 — Integração Meta: **PRÓXIMO** (exige nova ADR)
`META_ENABLED_IN_THIS_BUILD = false`. OAuth, descoberta de ativos, publicação PAUSED, ativação com
consentimento, pausa/retomada e insights. Depende do spike M0.

### M4 — Cobrança e piloto: **PRÓXIMO**
Gateway brasileiro, checkout hospedado, webhook assinado e idempotente, entitlements. Escolha do gateway pendente.

### M5 — Observabilidade e beta: **PRÓXIMO**
Monitor de uptime em `/ads/api/health`, alarmes, backup fora da VPS, threat model, checklist de release.
