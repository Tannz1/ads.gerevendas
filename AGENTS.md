# AGENTS.md — Regras inegociáveis (todos os agentes)

## Objetivo
Construir GereVendas Ads, produto multi-tenant e production-ready, priorizando simplicidade para donos de negócios locais, geração de anúncios estáticos editáveis, conexão Meta, publicação segura e acompanhamento.

## Hierarquia de instruções e referência
1. Segurança, conformidade e integridade dos dados.
2. Este AGENTS.md e decisões arquiteturais registradas (ADRs).
3. Contratos em `docs/08_CONTRATOS.md` e schemas compartilhados no código.
4. PRD e UX spec.
5. Backlog da sprint em execução.

## Guardrails absolutos
- Nunca alterar, apagar ou migrar dados do CRM GereVendas existente sem análise técnica + aprovação; implementar o Ads em projeto e ambiente isolados inicialmente.
- Nunca criar/ativar anúncios reais, alterar orçamento, conceder permissão ou disparar cobrança sem confirmação explícita do operador humano autorizado. Todas as campanhas surgem `PAUSED`.
- Nunca colocar tokens Meta, OpenAI, gateway ou service-role Supabase no frontend, logs, testes ou commits.
- Não simular sucesso da API externa como se fosse operação real. Em modo mock, rotular visualmente `Simulação`.
- Não criar forma própria de recolher Pix e automaticamente recarregar saldo Meta: pagamento de mídia no ambiente oficial Meta.
- Não presumir autorização de uso de marca Sebrae nem transferência dos dados de empresas participantes.
- Não incluir resultados, depoimentos, preços ou garantias que o cliente não confirmou. A IA gera propostas, não fatos.
- Não permitir alteração de gasto por IA sem autorização explícita do cliente e limites verificáveis.
- NUNCA desativar Row-Level Security para contornar erro de acesso.
- Nada de codificar payloads Meta especulativos como fatos: fixar API version e provar compatibilidade com testes de contrato reais.

## Padrões
- TypeScript strict, ESLint, Prettier, Zod, testes unitários/integração/e2e, logs estruturados com correlation_id.
- `organization_id` em todas as entidades de negócio; validação server-side e RLS.
- IDs externos da Meta são strings opacas; dinheiro em centavos (inteiros) + ISO currency.
- Filas com retry backoff, idempotency key, limites de custo e dead-letter/recovery.
- API retorna errors estruturados; UI trata loading, empty, error, restricted, missing-permissions e partial-success.
- Evitar copy carregada, imagens genéricas repetidas, falsos dados e interfaces sem responsividade.
- Todo PR deve conter: resumo, arquivos tocados, migrations, testes executados, evidência visual quando UI, riscos e rollback.

## Paralelismo seguro
- Claude: arquitetura/contratos/schema e revisão de integração.
- GPT/Codex: backend, integrações e testes de contrato.
- Antigravity: design system, frontend, editor e e2e visual.
- Um único agente por vez edita migrations, contracts e arquitetura. Outros consomem mocks/tipos exportados.
- Integração ocorre por PR. Sem refatoração de outro domínio sem autorização do orquestrador.

## Definition of Done global
Funcionalidade conectada à persistência real, controle de permissão, testes automatizados relevantes, UX completa (inclusive erro), telemetria, documentação e revisão de segurança. Mock/demonstração NÃO equivale a produção.

## Estado do repositório (fase 1)
- Escopo atual: fundação multi-tenant, landing, login, onboarding. **CRM e Meta Ads fora do escopo** (ver `docs/adr/0002-escopo-fase-1.md`).
- Contratos: `src/contracts/*` (Zod) e `docs/08_CONTRATOS.md`. Banco: `supabase/migrations/`. Testes de RLS: `npm run test:db`.
- Antes de abrir PR: `npm run check`, `npm run test:db` e `npm run test:e2e` (com `npm run build` antes).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
