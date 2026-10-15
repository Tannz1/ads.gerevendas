# GereVendas Ads

SaaS de criação, publicação e acompanhamento de anúncios Meta com IA para negócios locais.
Preço-alvo: R$ 199/mês (verba de mídia paga diretamente à Meta).

> **Status: fase 1 (fundação).** CRM e Meta Ads estão fora do escopo por enquanto. Veja
> [`docs/adr/0002-escopo-fase-1.md`](docs/adr/0002-escopo-fase-1.md).

## O que já existe

| Área | Situação |
| --- | --- |
| Landing (`/`) com proposta, preço e mídia à parte | Pronto |
| Login por link mágico (Supabase Auth, PKCE) em `/entrar` | Pronto, não testado contra projeto real |
| App autenticado (`/app`): shell responsivo, criação da empresa, início, conta | Pronto |
| Onboarding em 6 etapas com autosave, validação Zod e resumo (`/app/onboarding`) | Pronto |
| Banco multi-tenant com RLS, auditoria e RPCs (`supabase/migrations`) | Pronto, 29 testes de isolamento |
| Modo demonstração (sem Supabase, rotulado DEMO/Simulação) | Pronto |
| Estratégia/criativos com IA, editor, Meta, cobrança | Próximas fases |

## Rodando localmente

Requisitos: Node 22+, npm.

```bash
npm install
npm run dev            # http://localhost:3000
```

Sem variáveis de ambiente o app sobe em **modo demonstração**: não há login e os dados do onboarding
ficam só no `localStorage` do navegador. Toda a interface mostra o rótulo **DEMO / Simulação**.

### Com Supabase

1. Crie um projeto Supabase **isolado** (não use o banco do CRM).
2. Aplique as migrations: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. Em *Authentication → URL Configuration*, adicione `https://ads.gerevendas.com.br/**` (e
   `http://localhost:3000/**` para desenvolvimento) às Redirect URLs.
4. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `NEXT_PUBLIC_APP_URL`.

A service role key **não** é usada nesta fase. Todo acesso passa pela sessão do usuário + RLS.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run check` | lint + tipos + formatação + testes unitários |
| `npm run test:db` | sobe um Postgres temporário, aplica as migrations e roda os testes de RLS |
| `npm run build && npm run test:e2e` | E2E com Playwright (modo demonstração) + screenshots em 1440/1024/768/390/360 px |

Em containers com Chromium pré-instalado, use `PLAYWRIGHT_CHROMIUM_PATH=/caminho/do/chromium`.
O `test:db` precisa dos binários do PostgreSQL (`initdb`, `pg_ctl`, `psql`); use `PG_BIN` se não
estiverem no PATH. Não rode como root (o `initdb` recusa).

## Estrutura

```
src/
  app/                  rotas (App Router, Next.js 16 com Cache Components)
  components/           ui/ (design system), shell/, onboarding/, home/, marketing/
  contracts/            schemas Zod compartilhados (fonte da verdade dos contratos)
  lib/                  env, flags, dinheiro, telefone, logger, correlation id, clientes Supabase
  server/               server actions e camada de acesso a dados
  proxy.ts              sessão Supabase, correlation id e proteção de /app
supabase/
  migrations/           schema + RLS + RPCs
  rls-tests/            testes de isolamento multi-tenant (Postgres puro)
docs/                   pacote mestre, ADRs e contratos
agent_prompts/          prompts para GPT/Codex e Antigravity
```

## Documentação

- Regras para agentes: [`AGENTS.md`](AGENTS.md)
- Pacote mestre original: [`docs/00_PACOTE_MESTRE.md`](docs/00_PACOTE_MESTRE.md)
- Contratos: [`docs/08_CONTRATOS.md`](docs/08_CONTRATOS.md)
- Decisões: [`docs/adr/`](docs/adr)
- Deploy na VPS em `gerevendas.com.br/ads` (EasyPanel/Docker): [`docs/DEPLOY_EASYPANEL.md`](docs/DEPLOY_EASYPANEL.md)

Documentos citados no pacote mestre que **ainda não estão no repositório**: `docs/01_PRD.md`,
`docs/02_UX_UI.md`, `docs/03_ARQUITETURA_BACKEND.md`, `docs/04_IA_CRIATIVOS.md`,
`docs/05_META_PAGAMENTOS_SEGURANCA.md`, `docs/06_ROADMAP_MULTIAGENTES.md`,
`docs/07_PILOTO_SEBRAE_QA.md` e `agent_prompts/00_ORQUESTRADOR_CLAUDE.md`. As decisões desta fase
foram tomadas sem eles e estão registradas nos ADRs.
