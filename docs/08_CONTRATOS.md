# 08 — Contratos (fase 1)

Fonte da verdade: **`src/contracts/*.ts` (Zod)** e **`supabase/migrations/*.sql`**. Este documento
resume; em caso de divergência, vale o código. Dono: Claude (orquestrador). Outros agentes pedem
mudanças por PR/issue, não editam diretamente.

## Convenções

- IDs internos: UUID. IDs externos (Meta etc.): string opaca (`externalIdSchema`).
- Dinheiro: `*_cents` inteiro + `currency` ISO 4217 (`BRL`).
- Chaves de payload em `snake_case` (o mesmo objeto vai para o banco sem mapeamento).
- Toda entidade de negócio tem `organization_id`; toda tabela tem RLS.
- Integrações em modo `mock` são rotuladas **Simulação** na UI.

## Erro padrão (`src/contracts/api.ts`)

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "Revise os campos destacados.",
    "correlation_id": "6f1c…",
    "field_errors": { "offer.price_confirmed_by_client": ["Confirme que o preço é real e está vigente"] }
  }
}
```

Códigos: `validation_failed`, `not_authenticated`, `forbidden`, `not_found`, `conflict`,
`facts_not_confirmed`, `organization_limit_reached`, `feature_disabled`, `external_unavailable`,
`internal`. Sucesso: `{ "ok": true, "data": …, "correlation_id": "…" }`.

Estados de tela obrigatórios (`VIEW_STATES`): loading, empty, error, restricted,
missing_permissions, partial_success, ready.

## Onboarding (`src/contracts/onboarding.ts`)

Payload completo validado por `onboardingSchema` e enviado à RPC `complete_onboarding`:

```json
{
  "business": { "name": "Padaria Exemplo", "segment": "Alimentação", "city": "Campinas", "state": "SP",
                "instagram_handle": "padaria.exemplo", "whatsapp_e164": "+5519999990000", "website_url": "" },
  "offer": { "name": "Café da manhã completo", "description": "Pão na chapa, café e suco natural.",
             "price_cents": 2490, "currency": "BRL", "price_confirmed_by_client": true,
             "differentiators": ["Pão saindo do forno às 6h"] },
  "audience": { "description": "Moradores e trabalhadores do bairro", "age_min": 25, "age_max": 55,
                "service_radius_km": 3 },
  "goal": { "objective": "mensagens_whatsapp" },
  "identity": { "brand_primary_color": "#C2410C", "tone_of_voice": "acolhedor" },
  "review": { "facts_confirmed": true }
}
```

Regras:
- `price_cents` só existe com `price_confirmed_by_client = true` (Zod **e** CHECK no banco).
- `review.facts_confirmed` precisa ser `true` (Zod **e** RPC).
- Objetivo exige o canal: `mensagens_whatsapp` → WhatsApp; `visitas_perfil` → Instagram;
  `trafego_site` → site.
- Rascunho (`onboardingDraftSchema`): `{ step: 1..6, data: { business?, offer?, … } }`, guardando o
  estado do formulário como digitado.

## Server actions (`src/server/*`)

| Ação | Entrada | Saída `data` | Modo demo |
| --- | --- | --- | --- |
| `saveOnboardingDraft` | `OnboardingDraft` | `{ saved_at }` | `feature_disabled` (UI salva no navegador) |
| `completeOnboarding` | `OnboardingInput` | `{ business_id, offer_id, brief_id, replayed }` | `feature_disabled` |
| `createOrganization` | form `name` | redireciona para `/app/onboarding` | indisponível |
| `signInWithEmail` | form `email`, `next` | `{ status: "sent" }` | indisponível |

## Banco (`supabase/migrations/20261015120000_fundacao.sql`)

| Tabela | Observações |
| --- | --- |
| `organizations` | membros leem; owner/admin atualizam; criação só via RPC |
| `organization_members` | papéis `owner`/`admin`/`member`; somente leitura para clientes |
| `businesses`, `offers`, `briefs` | membros leem/escrevem; owner/admin apagam; FKs compostas impedem cruzar organizações |
| `onboarding_drafts` | 1 por organização; `completed_brief_id` torna a conclusão idempotente |
| `audit_events` | sem insert direto; leitura por owner/admin; escrita via `log_audit_event` |

RPCs: `create_organization(p_name, p_correlation_id)`,
`complete_onboarding(p_org, p_payload, p_correlation_id)` (SECURITY INVOKER, transação única),
`log_audit_event(...)` (ator sempre `auth.uid()`). `anon` não tem acesso a nenhuma tabela ou RPC.

## Criativos, Imagens e Créditos (`src/contracts/creatives.ts`)
- Tabelas: `generation_jobs`, `strategies`, `creatives`, `assets`, `usage_ledger`.
- RPCs: `start_strategy_job`, `finish_strategy_job`, `fail_generation_job`, `approve_creative`,
  `start_image_job`, `finish_image_job`, `register_photo`, `credit_summary`.

## Conta, Convites e LGPD (`src/contracts/account.ts`)
- Tabelas: `organization_invites`, `user_consents` e coluna `businesses.logo_asset_id`.
- RPCs: `create_organization_invite`, `revoke_organization_invite`, `inspect_organization_invite`,
  `accept_organization_invite`, `register_business_logo`, `record_user_consents`,
  `export_organization_data`, `delete_organization`.

## Campanhas e Conexão Meta (`src/contracts/campaigns.ts`, ADR 0004)
- Tabelas: `meta_connections`, `campaigns`, `campaign_creatives`, `publication_operations`.
- Guardrail no banco: trigger `campaigns_enforce_paused_on_insert` impede qualquer INSERT em `campaigns`
  com `status = 'active'`.
- RPCs: `upsert_meta_connection`, `disconnect_meta_connection`, `publish_campaign_paused` (exige `owner`
  e todas as peças `approved`), `activate_campaign` (exige segunda confirmação do `owner` com o mesmo
  snapshot de orçamento e duração), `pause_campaign`.

## Assinatura SaaS e Feedback do Piloto (`src/contracts/billing.ts`)
- Tabelas: `subscriptions`, `billing_events` (único por `(provider, event_id)`), `pilot_feedback`.
- RPCs: `process_billing_event`, `submit_pilot_feedback`.
- Rota de webhook: `POST /api/webhooks/billing` validada com HMAC-SHA256 (`x-webhook-signature`).

