# Criativos — Subprojeto 1 (Estratégia e peças) Implementation Plan

> Execução inline (pedido do usuário: subprojetos 1→2→3 sem pausas). Cada tarefa termina com testes
> verdes e commit.

**Goal:** brief concluído → estratégia com 5 ângulos → 5 peças editáveis → aprovar → PNG feed/stories.

**Architecture:** server action cria `generation_jobs` e roda o provedor em `after()`; resultado
validado (Zod + checagem de fatos) é gravado por RPC transacional; UI faz polling do job; template
único (flexbox, estilos inline) serve à prévia no navegador e ao `ImageResponse`.

**Tech Stack:** Next 16 (App Router, Cache Components), Supabase (Postgres/RLS), Zod 4, Vitest,
Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-criativos-design.md` · ADR `docs/adr/0003-criativos.md`

## Global Constraints

- Nada inventado: sem `%`, desconto, grátis, garantia, promoção, depoimento; `R$` só = preço confirmado.
- Saída do provedor simulado sempre `simulated = true` e rótulo **Simulação**.
- Sem service role; toda escrita com a sessão do usuário + RLS.
- Dinheiro em centavos + `BRL`; `organization_id` em toda tabela; RLS em toda tabela.
- PNG: 1080×1350 (`feed`), 1080×1920 (`stories`).
- Tokens/chaves nunca em log (logger já redige).

## Review Focus

- Provedor devolve JSON fora do schema ou com 4/6 ângulos → job `failed` (`invalid_output`), sem gravar nada.
- Dois cliques em "Gerar" → um job só (índice único parcial; segunda chamada devolve o job ativo).
- Oferta sem preço confirmado + `show_price: true` vindo do editor → recusado no servidor.
- Usuário de outra empresa pede o PNG de uma peça alheia → 404, não a imagem.
- Texto longo no título → template quebra linha sem sair da área segura (limites do schema: 60/140/24).

## Tasks

### Task 1: Contratos (`src/contracts/creatives.ts`, `tests/unit/creatives-contract.test.ts`)
Produz: `ANGLE_KEYS`, `TEMPLATES` (= ângulos), `strategyPlanSchema`, `StrategyPlan`,
`creativeContentSchema`, `CreativeContent`, `FORMATS = { feed: {1080,1350}, stories: {1080,1920} }`,
`JOB_STATUSES`. Testes: plano válido passa; 4 ângulos ou ângulo repetido falha; limites de texto.

### Task 2: Checagem de fatos (`src/server/ai/facts.ts`, `tests/unit/facts.test.ts`)
Produz: `checkFacts(plan, { price_cents: number | null }): string[]` (lista de violações) e
`priceLabel(cents)`. Testes: R$ igual ao confirmado ok; R$ diferente viola; "desconto"/"%"/"grátis" viola;
sem preço confirmado qualquer R$ viola.

### Task 3: Provedores (`src/server/ai/{types,mock-text,openai-text,provider,prompt}.ts`, testes)
Produz: `StrategyInput` (fatos do brief), `TextProvider`, `mockStrategy(input): StrategyPlan`,
`openaiText({ apiKey, model, fetchFn })`, `selectTextProvider(env)`, `PROMPT_VERSION`.
Testes: mock determinístico e aprovado por `checkFacts`; OpenAI monta corpo com `text.format`
json_schema e lê `output_text` + `usage` (fixture da doc); 429 → 1 nova tentativa; seleção mock sem chave
ou com kill switch.

### Task 4: Migration + RLS (`supabase/migrations/20261017120000_criativos.sql`,
`supabase/rls-tests/20_criativos_rls.test.sql`)
Tabelas `generation_jobs`, `strategies`, `creatives`; RPCs `start_strategy_job(p_brief)`,
`finish_strategy_job(p_job, p_plan, p_simulated, p_provider, p_model, p_prompt_version, p_in, p_out)`,
`fail_generation_job(p_job, p_code)`, `approve_creative(p_creative)`. Testes RLS: B não lê/edita de A;
member não aprova; job ativo duplicado devolve o mesmo id; finish cria 5 peças.

### Task 5: Servidor (`src/server/creatives.ts`)
`generateStrategy(briefId)`, `getJobStatus(jobId)`, `loadCreativesPage(orgId)`, `loadCreative(id)`,
`updateCreative(id, content)`, `approveCreative(id)`; `runStrategyJob` (em `after()`).

### Task 6: Template + PNG (`src/components/creatives/ad-template.tsx`, fontes TTF,
`src/app/app/criativos/[id]/imagem/route.ts`)
Template flexbox com 5 variações; rota devolve PNG com `Content-Disposition`. Teste unitário do
cálculo de escala/área segura; E2E confere dimensões.

### Task 7: UI (`src/app/app/criativos/page.tsx`, `[id]/page.tsx`, componentes em
`src/components/creatives/`, nav, card no início)
Estados: sem onboarding, gerando, falha, pronto, demo.

### Task 8: E2E e docs
`real.spec.ts` estendido (gerar → editar → aprovar → PNG 1080×1350/1080×1920 → B não vê);
demo mostra "Disponível no piloto"; STATUS/README.
