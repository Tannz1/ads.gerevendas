# ADR 0003 — Geração de criativos: provedores, jobs e render

- **Status:** aceito
- **Data:** 17/10/2026

## Contexto

O M2 precisa gerar estratégia (texto) e peças estáticas a partir do brief, com custo controlado,
sem worker separado nem fila gerenciada por enquanto (o app roda como um container Node no
EasyPanel) e sem chave da OpenAI disponível ainda.

## Decisão

- **Jobs:** tabela `generation_jobs` + `after()` do Next na server action. O container é de longa
  duração, então o trabalho continua após a resposta. Idempotência por índice único parcial (um job
  ativo por brief e tipo). Job `running` há mais de 5 min conta como falho e pode ser refeito.
  O trabalho usa a sessão do usuário (RLS), nunca service role.
- **Provedores:** interfaces `TextProvider` e `ImageProvider`; OpenAI via `fetch` (sem SDK), modelo
  por variável de ambiente; provedor simulado determinístico quando não há chave ou com kill switch.
  Saída simulada é gravada com `simulated = true` e rotulada **Simulação** na interface.
- **Render:** `ImageResponse` (Satori + Resvg, já no Next) gera o PNG 1080×1350 e 1080×1920 a
  partir do mesmo componente de template usado na prévia do editor. Fontes estáticas TTF no repo.
  Sem Playwright/Chromium em produção.

## Consequências

- Se o container reiniciar no meio de um job, ele fica `running` e expira em 5 min; o usuário
  refaz. Aceitável no piloto; fila dedicada (Trigger.dev ou equivalente) quando houver volume.
- Satori só aceita flexbox e um subconjunto de CSS: os templates ficam simples por construção.
- Compatibilidade com a API da OpenAI está coberta por fixture baseada na documentação; precisa ser
  confirmada com uma chamada real quando houver chave (registrado em `docs/STATUS.md`).

## Como reverter

Trocar `after()` por uma fila dedicada mantendo `generation_jobs` como estado; trocar o render por
worker Playwright mantendo os templates como dados.
