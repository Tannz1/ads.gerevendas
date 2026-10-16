# 06 — Roadmap, delegação e gates

## Regra de execução
**A unidade de entrega é o PR com critérios de aceite, não um volume arbitrário de código gerado.** Cada PR precisa build, testes, screenshots (UI), validação das interfaces afetadas e zero vazamento de secrets. Nunca executar dois agentes alterando o mesmo schema/contrato simultaneamente.

## Papéis
| Agente | Dono principal | Arquivos de propriedade |
|---|---|---|
| Claude | Orquestração, arquitetura, planejamento, schema, revisão | `docs/`, `packages/contracts/`, `supabase/migrations/`, ADRs |
| GPT/Codex | APIs internas, workers, integrações, testes de contrato | `apps/web/app/api/`, `apps/worker/`, `packages/integrations/`, `tests/contracts/` |
| Antigravity | UX/UI, design tokens, landing, wizard, editor, dashboards | `apps/web/app/(app)/`, `apps/web/app/(public)/`, `apps/web/components/`, `packages/ui/`, `tests/e2e/` |

## Milestone 0 — Discovery + Meta spike (gate: prova técnica)
- Claude: inventário read-only do CRM e arquitetura atual; ADR integração/SSO; requisitos de compliance e experiência piloto com Sebrae; contratos Meta e matriz de capacidades.
- GPT/Codex: aplicativo Meta de testes, OAuth callback seguro, tentativa real **PAUSED** com conta autorizada, get status/insights, captura de erros; documentação de limites. Ambiente mock sempre disponível.
- Antigravity: inspeção visual de ativos GereVendas disponíveis, wireframes das 6 telas essenciais e biblioteca de componentes base.
- Gate: relatório conclusivo: autorização de terceiros viável? criação de anúncio pausado ok? WhatsApp elegível? Caso negativo, alcance do MVP muda para tráfego website; não falsificar sucesso.

## Milestone 1 — Fundação
- Claude: monorepo, pacotes, schemas Zod, migrations RLS, ADRs de tenancy, contracts e CI.
- GPT/Codex: Auth, org CRUD, membership guards, storage assets, testes tenant isolation, mocks providers.
- Antigravity: landing, login, app shell, dashboard vazio, wizard com dados mockados e acessibilidade.
- Gate: login, 2 orgs isoladas, onboarding persistido, CI verde, browser checks desktop/mobile.

## Milestone 2 — Estratégia e geração
- Claude: schema de `StrategyPlan`, template catalog, factuality rules, feature flags, contratos de jobs.
- GPT/Codex: OpenAI adapter, text model, image adapter, credit ledger, job states, render worker, storage, retry e testes.
- Antigravity: gallery, canvas editor, variantes, preview feed/story, estado de geração e comentários.
- Gate: um briefing real gera cinco conceitos, edição e export 1080×1350/1080×1920; checagem factual; crédito não duplicado; preview compatível.

## Milestone 3 — Integração Meta
- Claude: aprova state machine, revisa IAM/token management, consentimento e idempotência.
- GPT/Codex: Meta OAuth/account discovery, eligibility, publish paused, verify, activate, pause, reconcile, insights. Flag mock/real.
- Antigravity: fluxo conectar ativos, error recovery, budget confirmation, estados review/rejected e dashboard.
- Gate: campanha em conta elegível é criada PAUSED sem duplicação, UI confirma gasto e operação; ativa só após autorização; job recuperável se falhar.

## Milestone 4 — Billing e piloto
- Claude: revisão de LGPD, relatórios agregados, checklists operacionais, documentação do contrato SaaS.
- GPT/Codex: checkout, webhooks, assinatura, entitlements, usage ledger, invoices, abuse controls, audit.
- Antigravity: billing settings, pilot feedback, UX revisão do fluxo, estados de cobrança.
- Gate: assinatura simulada e testada no sandbox do gateway, evento duplicado idempotente, operações de cliente desabilitadas conforme entitlement e política.

## Milestone 5 — Observabilidade e Beta
- Claude: threat model, readiness checklist, rota de incidentes, release criteria, revisão final do MVP.
- GPT/Codex: métricas de custo/latência, alarms, backup/recovery, load tests, OAuth expiration drills.
- Antigravity: mobile e11y audits, e2e Playwright, polish, componentes erro/vazio, finalização LP.
- Gate: piloto de cohort autorizado; sucesso em fluxos elegíveis e qualidade de geração observada; zero ativação sem aprovação; rollback testado.

## PRs sugeridos (não paralelizar conflitos)
1. `chore/monorepo-and-ci` — Claude.
2. `feat/design-system-shell` — Antigravity.
3. `feat/auth-tenant-core` — GPT/Codex.
4. `feat/onboarding-and-profile` — Antigravity + backend em PR separado.
5. `feat/ai-strategy-contract` — Claude.
6. `feat/ai-generation-workers` — GPT/Codex.
7. `feat/creative-editor` — Antigravity.
8. `feat/meta-adapter-pausable` — GPT/Codex.
9. `feat/meta-connection-ui` — Antigravity.
10. `feat/billing-ledger` — GPT/Codex.
11. `feat/pilot-telemetry` — GPT/Codex + revisão Claude.
12. `release/pilot-readiness` — Claude revisão + todos testes.

## Ritual de sincronização
- No início de cada tarefa: verificar latest main/AGENTS, registrar arquivo de propriedade, inputs e riscos.
- Antes de alterar contrato, migration ou auth, criar ADR com impacto e API version; dependentes esperam merge.
- Compartilhar mock fixtures e Zod types cedo para UI progredir sem backends reais.
- Depois do PR: relatório com comportamento observado, o que está simulado, pendências, screenshots, testes e migrações.
- Na integração: merge de módulos independentes; resolver conflitos no contrato central com Claude dono da arquitetura.

## Proibições
- Não fazer deploy em produção porque UI ficou bonita.
- Não declarar conexões Meta, Pix ou resultados como reais sem validação no ambiente de teste.
- Não usar navegador automatizado para contornar bloqueios de conta ou pagamento da Meta.
- Não pedir tokens ou dados de empresas em chats dos agentes; usar secret manager.
