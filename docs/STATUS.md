# Status do GereVendas Ads

Atualizado em 25/10/2026. Legenda: **REAL** (funciona com persistência real), **MOCK** (simulação
rotulada), **BLOQUEADO** (depende de decisão ou acesso externo), **PRÓXIMO** (ainda não existe código).

Os documentos 03 e 06 citam um monorepo (`apps/web`, `packages/contracts`). O código é um app
Next.js único (ADR 0001): `apps/web` corresponde a `src/app`, `packages/contracts` a `src/contracts`.

## Ambiente

| Item | Situação |
| --- | --- |
| Produção | `https://signal-crm-staging-ads.onv9zt.easypanel.host/ads` (EasyPanel, projeto `signal-crm-staging`, serviço `ads`), **REAL** com Supabase próprio (commit `73aff92`) |
| CI (GitHub Actions) | Lint, tipos, unitários, build, migrations + RLS em Postgres, E2E na raiz e em `/ads` |
| Supabase local | **REAL**: `npx supabase start`; login, empresa, onboarding e isolamento validados por `tests/e2e/real.spec.ts`; 7 suites de testes de RLS passam no Postgres do Supabase |
| Supabase do Ads | **REAL**: self-hosted no EasyPanel (serviço Compose `ads-supabase`, `infra/supabase/`), API em `https://signal-crm-staging-ads-api.onv9zt.easypanel.host`; migrations aplicadas no deploy. **BLOQUEADO**: SMTP não configurado, então o link mágico não é enviado |
| Domínio `gerevendas.com.br/ads` | **BLOQUEADO**: o domínio está na Hostinger, não na VPS; precisa de rewrite lá ou de subdomínio apontado para a VPS |
| Deploy automático | **BLOQUEADO**: EasyPanel sem token do GitHub (Settings → GitHub) |
| Limite de CPU/memória do serviço | Pendente: aplicar no EasyPanel para não disputar recursos com o CRM |

## Milestones (docs/06)

### M0 — Discovery + spike Meta: adiado por decisão do produto (ADR 0002)
- Inventário read-only do CRM: **PRÓXIMO** (`CRM_INTEGRATION_PENDING`).
- App Meta de teste, OAuth e criação PAUSED em conta autorizada: **BLOQUEADO** (precisa de app Meta e conta autorizada).

### M1 — Fundação: concluída e validada no Supabase local; produção aguarda Supabase em nuvem
- Landing, login por link mágico, shell, início, conta, 404/erro em pt-BR: **REAL**, validado no Supabase local.
- Organizações, membros (`owner`/`admin`/`member`/`support`), auditoria, RLS: **REAL** no banco.
- Onboarding em 6 etapas com autosave e conclusão idempotente: **REAL** com Supabase; **MOCK** (navegador) no modo demo.
- Convites de equipe (`/convite/[token]`), upload de logotipo da marca (Storage privado + `AdTemplate`), termos e consentimentos, exportação JSON e exclusão definitiva de dados (LGPD): **REAL** no banco (`20261020110000_conta_convites_lgpd.sql`, testes de RLS em `50_conta_lgpd_rls.test.sql`).

### M2 — Estratégia e criativos: concluído (spec `docs/superpowers/specs/2026-10-17-criativos-design.md`, ADR 0003)
- Subprojeto 1, estratégia + 5 peças + composições visuais distintas por ângulo + editor + regeneração isolada de copy + aprovação + PNG 1080×1350/1080×1920: **REAL** no Supabase local. Sem chave da OpenAI roda o provedor **MOCK** rotulado Simulação.
- Provedor de texto OpenAI (Responses API, JSON Schema estrito): **REAL**, validado em 17/10/2026 com `gpt-6-sol`.
- Subprojeto 2, imagem de fundo: foto do cliente (JPG/PNG até 5 MB, conferida pelos bytes, com declaração de direito de uso) e geração com OpenAI Images (`gpt-image-2.5-flare`): **REAL**. Desde 23/10/2026 as 5 imagens saem junto com a estratégia, com o texto de cada peça como contexto (prompt `image.v3`: briefing de foto escrito pela estratégia `strategy.v3` e área livre conforme o layout da peça, sem preços nem números); a lista oferece gerar as que faltarem.
- Subprojeto 3, créditos e limites: **REAL** no Supabase local (ledger append-only `reserve`/`commit`/`release`).
- Dataset de avaliação automatizada com 12 segmentos locais (`tests/unit/evaluation-dataset.test.ts`): **REAL**.

### M3 — Integração Meta e Campanhas: concluído em modo Simulação + persistência real no Postgres (ADR 0004)
- BM única com estoque de contas (ADR 0005, `docs/META_OPERADOR.md`): estoque, papel de operador e
  trilha de 4 passos em `/app/conexoes` (conta do estoque, Página/Instagram compartilhados como parceiro,
  convite da BM, pagamento confirmado pela Meta) **REAL** no banco e em **Simulação**; painel
  `/app/operador/estoque`. Modo real **BLOQUEADO** até System User + teste de contrato
  (`npm run test:meta-contract`). Login do Facebook do cliente removido.
- Tabelas `meta_connections`, `campaigns`, `campaign_creatives` e `publication_operations` com RLS e RPCs (`20261020120000_campanhas_meta.sql`, testes de RLS em `60_campanhas_meta_rls.test.sql`): **REAL** no banco.
- Telas `/app/conexoes`, `/app/campanhas`, `/app/campanhas/nova` e `/app/campanhas/[id]` com separação explícita de livros financeiros (`R$ 199/mês` software vs mídia paga à Meta), criação obrigatoriamente `PAUSED` e ativação mediante segunda confirmação do `owner`: **REAL** no banco, operando com adaptador Meta **MOCK** rotulado **Simulação**.

### M4 — Cobrança e Assinatura SaaS: concluído em modo Simulação/Sandbox + Webhook HMAC
- Tabelas `subscriptions` e `billing_events` idempotentes por `(provider, event_id)` com RLS e RPC `process_billing_event` (`20261020130000_assinatura_e_piloto.sql`, testes de RLS em `70_assinatura_piloto_rls.test.sql`): **REAL** no banco.
- Rota `/api/webhooks/billing` com verificação HMAC-SHA256 em tempo constante (`src/lib/webhook-signature.ts`): **REAL**.
- Tela `/app/assinatura` com status do plano (`R$ 199/mês`), medidor de créditos do ciclo, histórico de eventos e controles de sandbox: **REAL** no banco, provedor **MOCK** rotulado **Simulação**.

### M5 — Feedback do Piloto e Observabilidade
- Coleta de avaliação rápida do piloto (`pilot_feedback` + `PilotFeedbackBox` em Criativos): **REAL** no banco.
- Healthcheck `/api/health`, testes unitários, RLS e E2E: **REAL**.

