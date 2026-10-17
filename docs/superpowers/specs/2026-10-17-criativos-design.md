# Criativos (M2) — design

Data: 17/10/2026. Base: `docs/04_IA_CRIATIVOS.md`, `docs/02_UX_UI.md` (telas E, F, G), `docs/03` (jobs),
`docs/06` (M2). Decisões de arquitetura em `docs/adr/0003-criativos.md`.

## Objetivo

Depois do onboarding, o dono do negócio recebe uma estratégia com 5 ângulos e 5 anúncios estáticos
editáveis, baseados só no que ele confirmou, e baixa cada peça em 1080×1350 (feed) e 1080×1920
(stories). A IA propõe; o cliente revisa e aprova. Nada é inventado: sem descontos, depoimentos,
garantias, resultados ou preço não confirmado.

Critério de sucesso: no Supabase local, um usuário conclui o onboarding, gera a estratégia, edita
uma peça, aprova e baixa os dois formatos; outra empresa não vê nada disso (RLS + E2E).

## Entrega em três subprojetos (nesta ordem)

1. **Estratégia e peças**: geração da estratégia (texto), 5 peças com templates, galeria, editor,
   aprovação e PNG. Fundo = cor da marca. Registro de uso de IA por job.
2. **Imagem-base**: foto do cliente (upload com declaração de direito de uso) ou imagem gerada por IA
   sem texto; Storage privado; regenerar só a imagem sem perder o texto.
3. **Créditos e limites**: ledger append-only (reserva → consumo | devolução), limites do plano por
   mês, teto de custo e medidor na interface.

## Subprojeto 1 — Estratégia e peças

### Fluxo

1. Início mostra "Gerar estratégia" quando o onboarding está concluído. Menu ganha **Criativos**.
2. `generateStrategy(briefId)` (server action) valida o brief (`submitted`), cria um job
   `strategy` (idempotente: se já existe job `queued`/`running` para o brief, devolve o mesmo) e
   responde na hora. O trabalho roda em `after()`.
3. O job monta a entrada **só com fatos do brief** (negócio, oferta, preço confirmado, público,
   objetivo, tom), chama o provedor de texto, valida com Zod, aplica as checagens de fatos e grava
   a estratégia + 5 peças numa RPC transacional. Falha → job `failed` com `error_code`.
4. `/app/criativos` acompanha o job (polling a cada 2 s, para em `succeeded`/`failed`) e mostra a
   estratégia (resumo, 5 ângulos, chips "Precisa confirmar") e a galeria das 5 peças (prévia 4:5).
5. `/app/criativos/[id]` é o editor: título, texto de apoio, CTA, preço (só se confirmado no
   onboarding), template, cores; prévia Feed e Stories lado a lado; Salvar; Aprovar (owner/admin).
6. `GET /app/criativos/[id]/imagem?formato=feed|stories` devolve o PNG (`ImageResponse`), só para
   membros da empresa (sessão + RLS).

### Contrato `StrategyPlan` v1 (`src/contracts/creatives.ts`)

```
{ business_summary: string(≤400),
  angles: 5 × { key: "oferta"|"problema"|"beneficio"|"demonstracao"|"conveniencia",
                label: string(≤40), rationale: string(≤240),
                headline: string(≤60), body: string(≤140), cta: string(≤24) },
  targeting_proposal: { locations: string[], age_range: string(≤40) },
  assumptions: string[≤6], fields_requiring_confirmation: string[≤6] }
```

Os 5 ângulos são exatamente um de cada `key`. `CreativeContent` (o que o editor muda):
`{ template, headline, body, cta, show_price, colors: { background, accent, text } }`.

### Checagens de fatos (antes de gravar; função pura com testes)

- Valor em reais (`R$ …`) no texto só se for o preço confirmado; senão o job falha
  (`facts_violation`).
- Proibido sem confirmação: `%`, "desconto", "grátis", "garantia", "garantido", "promoção",
  "últimas unidades", "depoimento". Viola → `facts_violation`.
- `show_price` só pode ser `true` se a oferta tem `price_cents`.

### Provedores (`src/server/ai/`)

- `TextProvider.generateStructured(schema, system, input)` → `{ data, usage }`.
- `openaiText`: Responses API via `fetch` (sem SDK), `text.format` = JSON Schema gerado do Zod
  (`z.toJSONSchema`), timeout 60 s, 1 nova tentativa em 429/5xx. Modelo em `OPENAI_TEXT_MODEL`.
- `mockText`: determinístico, monta o plano a partir dos próprios dados do brief; tudo que ele gera
  é rotulado **Simulação** (`strategies.simulated = true`).
- Escolha: real só com `OPENAI_API_KEY` + `OPENAI_TEXT_MODEL` e kill switch desligado; senão mock.
- `PROMPT_VERSION = "strategy.v1"`; job registra provedor, modelo, versão do prompt e tokens.

### Banco (migration aditiva; RLS em tudo)

- `generation_jobs(id, organization_id, kind, status, brief_id, creative_id, provider, model_id,
  prompt_version, input_tokens, output_tokens, error_code, created_by, created_at, started_at,
  finished_at)`; índice parcial único: um job `queued|running` por (brief, kind).
- `strategies(id, organization_id, brief_id, job_id, version, plan jsonb, simulated, created_at)`,
  único (brief_id, version).
- `creatives(id, organization_id, strategy_id, angle_key, content jsonb, status draft|approved,
  approved_by, approved_at, updated_at)`, único (strategy_id, angle_key).
- Leitura: membros. Escrita de jobs/estratégias/peças: só pelas RPCs `start_generation_job`,
  `finish_strategy_job`, `fail_generation_job` (SECURITY INVOKER, checam membership). Editar peça:
  membros (volta a `draft` se mudar conteúdo aprovado). Aprovar: owner/admin.
- Job `running` há mais de 5 min é tratado como falho na leitura e pode ser refeito.

### Estados de tela

Sem onboarding concluído (empty com CTA), gerando (skeleton + texto), falha (mensagem + tentar de
novo + código), pronto, modo demonstração ("Disponível no piloto com conta": demo não gera peças).

## Subprojeto 2 — Imagem-base

- Tabela `assets(id, organization_id, kind photo|generated, storage_path, mime, width, height,
  rights_confirmed_at, job_id, created_by)`; bucket privado `creative-assets`, caminho
  `{organization_id}/{asset_id}.{ext}`, RLS em `storage.objects` pelo primeiro segmento.
- Upload de foto (JPEG/PNG/WebP, até 8 MB) exige marcar "Tenho direito de usar esta imagem".
- `ImageProvider.generateBackground({ scene_prompt, colors })`: OpenAI Images (`OPENAI_IMAGE_MODEL`),
  prompt pede imagem **sem texto, preço ou logotipo**; mock = sem imagem (fundo da cor) +
  Simulação. Job `image` por peça.
- `creatives.image_asset_id`; editor: "Usar foto", "Gerar imagem", "Remover imagem". Gerar de novo
  troca só a imagem; texto e cores ficam.
- PNG embute a imagem baixada do Storage (servidor) como data URI.

## Subprojeto 3 — Créditos e limites

- `usage_ledger(id, organization_id, period 'YYYY-MM', resource strategy|image, entry
  reserve|commit|release, units, job_id, created_at)`, só inserção via RPC.
- Limites por mês (constantes): 4 estratégias, 20 imagens geradas. Reserva antes do job (falha com
  `credit_limit_reached` se não há saldo), commit no sucesso, release na falha. Variantes de formato
  e edição não consomem.
- Teto de tokens por empresa/mês para o provedor real (`AI_MONTHLY_TOKEN_CAP`, padrão 2 milhões).
- Medidor "Gerações este mês" no topo de Criativos.

## Testes

- Unitários: schema `StrategyPlan`, checagens de fatos, mock determinístico, montagem da requisição
  e leitura da resposta do OpenAI (fixture baseada na documentação, marcada como tal), escolha de
  provedor, saldo de créditos.
- RLS (`supabase/rls-tests`): empresa B não lê/edita/aprova peças, jobs, assets, ledger de A; member
  não aprova; ledger sem insert direto.
- E2E real (`tests/e2e/real.spec.ts`): onboarding → gerar → editar → aprovar → baixar PNG
  (dimensões conferidas) → outra empresa não vê.
- E2E demo: Criativos mostra "Disponível no piloto".

## Fora deste escopo

Meta, cobrança, vídeo, carrossel, editor livre (arrastar elementos), extração de site, avaliação
com dataset de 36 briefs (fica para o piloto).
