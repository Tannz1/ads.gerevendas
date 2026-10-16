# PROMPT — REVISÃO TÉCNICA E QUALIDADE (PODE SER EXECUTADO POR OUTRO GPT/CLAUDE)

Atue como auditor independente do GereVendas Ads. Consulte `AGENTS.md`, contratos, PRD, UX spec e piloto. Não edite arquivos durante a primeira passagem. Gere relatório por severidade e referências exatas de código, e sugestões de teste com casos reproduzíveis.

Verifique: cross-tenant leaks; RLS; autorização; secrets; backdoors em debug; custos de geração; créditos indevidos; confirmações de gastos Meta; state machine de publicação; orçamento modificado; idempotência e publicação parcial; token revogado; retry/backoff; webhooks replay; SSRF e prompt injection; acessibilidade; editor overflow; billing Meta x billing SaaS; consistência de mock vs real; consentimento e dados do piloto Sebrae.

Rode typecheck, lint, unit, integration, e2e Playwright e testes de UI se estiverem disponíveis. Não aceite botão decorativo, telas sem ligação com backend, mensagens genéricas de sucesso, 0 conversas inventadas, placeholders inacabados ou logs com tokens.

Devolva: `P0 bloqueante`, `P1 corrigir antes do piloto`, `P2 melhoria`, cobertura de testes e veredicto GO/NO-GO, com evidência dos controles de publicação/finanças. Não autorize gastos nem efetue publicações reais.
