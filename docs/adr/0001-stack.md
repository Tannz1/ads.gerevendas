# ADR 0001 — Stack da fundação

- **Status:** aceito
- **Data:** 15/10/2026

## Decisão

| Camada | Escolha |
| --- | --- |
| Web | Next.js 16 (App Router, Cache Components, Partial Prefetching), React 19, TypeScript strict |
| Estilo | Tailwind CSS 4 com tokens em `src/app/globals.css` (paleta provisória) |
| Contratos | Zod 4 em `src/contracts`, compartilhado entre UI, server actions e testes |
| Dados/Auth | Supabase (Postgres + Auth). Link mágico por e-mail (PKCE) via `@supabase/ssr` |
| Isolamento | `organization_id` em toda entidade + RLS; funções auxiliares em schema `private` |
| Testes | Vitest (unitários), SQL em Postgres puro (RLS), Playwright (E2E e screenshots) |
| CI | GitHub Actions: qualidade, banco e E2E |

## Motivos

- Next.js + Supabase é a stack pedida nos prompts dos agentes (Antigravity e Codex).
- O próprio Postgres impõe o isolamento entre empresas (RLS), em vez de só a aplicação.
- Testes de RLS em Postgres puro rodam em segundos no CI, sem Docker nem Supabase CLI.

## Consequências

- `src/proxy.ts` substitui o antigo `middleware.ts` (convenção do Next 16).
- Leituras de sessão ficam atrás de `<Suspense>` (exigência do Cache Components).
- shadcn/ui não foi instalado: os componentes base estão em `src/components/ui`. O frontend pode
  adotá-lo depois, mantendo os tokens.
- Toda escrita de domínio passa pela sessão do usuário. Service role só para jobs futuros.
