# 03 — Arquitetura, backend, banco e infraestrutura

## Decisão arquitetural
Monorepo `pnpm` + `Turborepo`. Next.js App Router, TypeScript strict, Tailwind + shadcn/ui, Supabase Auth + PostgreSQL/RLS + Storage, jobs com Trigger.dev (ou equivalente após ADR), renderização HTML/CSS via Playwright em worker containerizado, OpenAI em adapter, Meta Marketing API em adapter, pagamento por gateway brasileiro em adapter, Sentry + logs estruturados. Vercel apenas para frontend e APIs curtas; tarefas pesadas em workers.

```
User browser
   -> apps/web Next.js (UI, BFF, rate limit, auth)
       -> packages/contracts Zod/schema/shared types
       -> Supabase Auth/Postgres/Storage/RLS
       -> Trigger job queue -> apps/worker / workflows
           -> services/strategy (OpenAI text)
           -> services/image (OpenAI Images)
           -> services/render (Playwright templates)
           -> services/meta (Meta Graph adapter)
           -> services/reporting (Insights adapter)
       -> services/billing (gateway webhook)
       -> audit + observability
```

## Estrutura inicial do repositório
```
apps/
  web/
    app/(public)/ app/(auth)/ app/(app)/ api/
    components/ features/ lib/
  render-worker/
    src/ Dockerfile
packages/
  contracts/  # Zod + tipos + erros
  ui/         # design system
  config/     # flags, providers, logger
  templates/  # HTML/CSS declarativo dos criativos
supabase/
  migrations/ seeds/ tests/
docs/
tests/
  e2e/ contracts/ fixtures/
```

## Modularização backend
- **Identity**: auth, org, members, roles, invitations, session guards.
- **Business**: perfil da empresa, marcas, produtos, ofertas e fontes autorizadas.
- **Creative**: brief, plano, prompt, generation job, credit reservation, assets, versões e revisão.
- **Campaign**: drafts, budgets, approval, status, publishing reconciliation, pause/resume.
- **Meta**: OAuth, token vault, assets discovery, publisher, insights, errors, versioned adapters.
- **Billing**: plans, subscriptions, invoice/webhook, usage ledger, access entitlement.
- **Pilot**: invite codes, consenting participants, feature flags, survey results.
- **Audit**: operations/event log append-only, security access events.

## Modelo lógico (todas as tabelas de negócio com `organization_id`)
1. `organizations(id, name, slug, created_at, status)`.
2. `organization_members(id, organization_id, user_id, role, status)` (unicidade org+user).
3. `business_profiles(id, organization_id, segment, display_name, description, cities, website_url, brand_colors, onboarding_status)`.
4. `offers(id, organization_id, title, description, price_cents, currency, conditions, valid_until, approved_at)`.
5. `assets(id, organization_id, storage_key, type, mime, origin, rights_confirmed_at, metadata)`.
6. `briefs(id, organization_id, offer_id, objective, location_json, audience_notes, status, created_by)`.
7. `strategy_versions(id, organization_id, brief_id, json_schema_version, strategy_json, approved_at, model_id, usage_cost_cents)`.
8. `creative_batches(id, organization_id, brief_id, status, qty_requested, generation_job_id)`.
9. `creatives(id, organization_id, batch_id, concept, copy_json, template_id, image_asset_id, status, version)`.
10. `creative_variants(id, organization_id, creative_id, format, final_asset_id, render_version, qa_status)`.
11. `meta_connections(id, organization_id, meta_business_id, connection_status, credentials_ref, scopes, last_checked_at)` (não armazenar token em plaintext).
12. `meta_ad_accounts(id, organization_id, connection_id, external_account_id, name, currency, status)`.
13. `campaign_drafts(id, organization_id, brief_id, ad_account_id, objective, budget_cents, budget_type, currency, start_at, end_at, status, approval_snapshot_json, approved_by, approved_at)`.
14. `meta_publications(id, organization_id, draft_id, external_campaign_id, external_adset_ids_json, external_ad_ids_json, state, idempotency_key, error_code, attempts)`.
15. `campaign_insights(id, organization_id, publication_id, date, granularity, spend_cents, impressions, reach, actions_json, synced_at)`.
16. `subscription_accounts(id, organization_id, provider, external_subscription_id, plan, billing_status, current_period_end)`.
17. `usage_ledger(id, organization_id, type, units, period, reason, job_id, committed_at)` (reservas/commit/reversal append-only).
18. `jobs(id, organization_id, type, status, payload_ref, attempts, error, correlation_id)`.
19. `audit_events(id, organization_id, actor_user_id, action, resource_type, resource_id, occurred_at, correlation_id, metadata_redacted)`.
20. `pilot_participants(id, organization_id, invitation_id, consent_version, opted_in_at, cohort, status)` e `pilot_feedback`.

### Banco e RLS
- RLS obrigatória em todas as tabelas organizacionais, políticas comparando org com membership authenticated e status ativo; negar por padrão.
- Índices tenant + data/status e FK obrigatória, unique (`organization_id`, `external_account_id`), unique (`draft_id`, `idempotency_key`) conforme domínio.
- Secrets no vault/secret manager; `credentials_ref` aponta para segredo criptografado e versionado, backend service identity restrita.
- Toda operação backend valida org/role **antes** da chamada Meta. RLS continua habilitada como segunda defesa.
- Migrations versionadas, aplicação em staging primeiro; nunca modificar schema do CRM existente automaticamente.

## Workflow de geração (assíncrono)
`brief_submitted -> strategy_pending -> strategy_ready -> strategy_approved -> images_queued -> image_generating -> rendering -> qa_pending -> creatives_ready -> approved`.
Cada job possui idempotency key por tenant + request hash e reserva de crédito. Se job falha: registrar motivo, reversão de créditos ainda não consumidos, retomada manual. Streaming/consulta do status via polling ou realtime com controle de ACL.

## Workflow de publicação (state machine)
`draft -> ready_for_validation -> blocked | validated -> approved_by_owner -> creating_paused -> published_paused -> awaiting_activation_confirmation -> activation_requested -> meta_review -> active | rejected | failed | paused | completed`.
Não existe transição automática `draft -> active`. Sempre registrar snapshot imutável do budget/asset/terms consentidos. Cada criação Meta é persistida logo após receber o ID. Reconcile antes de retry, para evitar duplicação em timeout.

## Jobs
`analyze_business`, `generate_strategy`, `generate_image`, `render_variants`, `validate_creative`, `validate_meta_connection`, `publish_paused`, `activate_campaign`, `pause_campaign`, `sync_insights`, `sync_subscription`, `expire_unconfirmed_drafts`, `pilot_aggregate_metrics`.
Priorizar filas separadas: image (custo/latência), publish (alta segurança), metrics (periódico) e billing (crítico/idempotente). Limites por cliente e global.

## APIs internas (namespace `/api/v1`)
`POST /organizations`; `PUT /business-profile`; `POST /offers`; `POST /briefs`; `POST /briefs/:id/generate-strategy`; `POST /strategy/:id/approve`; `POST /creative-batches`; `GET /jobs/:id`; `PATCH /creatives/:id`; `POST /creatives/:id/regenerate`; `POST /creatives/:id/approve`; `GET /meta/connect`; `GET /meta/callback`; `GET /meta/accounts`; `POST /campaign-drafts`; `POST /campaign-drafts/:id/approve`; `POST /campaign-drafts/:id/publish-paused`; `POST /campaign-drafts/:id/activate`; `POST /campaigns/:id/pause`; `GET /campaigns/:id/insights`; `POST /billing/checkout`; `POST /webhooks/billing`; `POST /pilot/feedback`.
Callbacks Meta e billing têm CSRF `state` e validação de assinatura conforme provedor; API endpoints sensíveis exigem auth e rate limits. Respostas assíncronas retornam 202 + `job_id`.

## Observabilidade e operações
- Logs: `request_id`, `correlation_id`, `organization_id` pseudonimizado conforme contexto, `job_id`, latency, response category; nunca access tokens ou credenciais.
- Métricas: geração por criativo, preço por lote, retries, sucesso publicação, rejeição Meta, onboarding, publish funnel, falhas por token e rate limits.
- Alertas: publicação parcial, saldos de crédito inconsistentes, divergência de orçamento, webhook falhando, 401 repetido, uso anormal de API.
- Feature flags por organização e ambiente, kill switch global para publicação real.

## Infra e deploy
- Supabase projetos separados `staging` e `production`; organizações de teste nunca compartilham dados reais por acidente.
- Vercel environments preview/staging/prod com URLs e Meta callbacks próprios.
- Workers isolados com deployment próprio; Playwright browser server containerizado.
- Migração versionada CI; branch protection, migrations review + security tests + smoke-test; rollback de deploy e migração aditiva.
- Backups e teste de recuperação de banco; Storage privado com URLs assinadas expirantes.

## Auditoria do CRM existente (read-only, fase 0)
Descobrir stack, deploy, domínios, auth, modelo de organização, identidade visual real, APIs e constraints de licenciamento. Registrar ADR: SSO futuro, sincronização de produtos e leads, e separação de dados. Não modificar CRM até desenho aprovado.
