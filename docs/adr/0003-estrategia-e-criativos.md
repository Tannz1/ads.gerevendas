# ADR 0003 — Estratégia e criativos com IA (fase 2)

- **Status:** aceito
- **Data:** 16/10/2026

## Decisão

1. **Geração assíncrona com job.** `requestStrategyGeneration` enfileira um job
   (`enqueue_generation_job`, idempotente por chave e por brief em andamento) e responde na hora
   com `job_id` (equivalente a 202). O trabalho roda em `after()` do Next no mesmo processo, com
   até 3 tentativas e backoff. A UI consulta o status. Job "running" há mais de 5 minutos é tratado
   como travado (`stale_timeout`). Fila dedicada (ex.: Trigger.dev) fica para quando houver volume.
2. **Escritas só via RPC.** `strategies`, `creative_concepts`, `creatives` e `generation_jobs` só têm
   SELECT para clientes. Transições de estado (`queued → running → succeeded|failed`), versão de
   estratégia, provider/simulação (herdados do job) e regras de preço são impostos no banco.
3. **Sem service role.** O runner usa a sessão do usuário que pediu a geração.
4. **Provider de texto plugável.** `AI_PROVIDER=mock` (padrão, determinístico, rotulado
   **Simulação**) ou `openai` (Responses API com saída estruturada, modelo por `OPENAI_TEXT_MODEL`).
   No modo demonstração (sem Supabase) a geração usa sempre o mock e nada é persistido.
5. **Veracidade (fact-guard).** Toda saída passa por `generatedStrategySchema` e por checagens
   contra os fatos do brief: preço só com preço confirmado e no valor exato; números, percentuais,
   descontos, garantias, superlativos e depoimentos que não estejam nos fatos são recusados.
   Uma nova tentativa recebe os problemas como feedback; conceitos que continuarem fora são
   descartados (mínimo de 3).
6. **Peças determinísticas.** Templates em JSX compatível com Satori renderizam igual no editor
   (DOM) e na exportação PNG (`/api/render`, `next/og`). Formatos 4:5 (1080×1350) e 9:16
   (1080×1920) com áreas seguras fixas. Salvar usa concorrência otimista (`version`); editar desfaz
   a aprovação.
7. **Custos.** Limite de 20 gerações por organização a cada 24 h; tokens e custo estimado
   (micro-USD) gravados no job. Créditos/cobrança continuam fora do escopo.

## Fora do escopo desta fase

Geração de imagem por IA (precisa de Storage privado e custos próprios), upload de logo,
Meta, CRM e cobrança.
