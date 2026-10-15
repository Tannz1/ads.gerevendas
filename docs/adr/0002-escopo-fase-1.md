# ADR 0002 — Escopo da fase 1: sem CRM e sem Meta Ads

- **Status:** aceito
- **Data:** 15/10/2026

## Contexto

Decisão do responsável pelo produto: deixar a integração com o CRM GereVendas e a Meta Marketing
API de lado nesta fase. O AGENTS.md já exige implementar o Ads isolado do CRM e homologar a Meta
antes de assumir payloads.

## Decisão

Dentro do escopo:
- fundação multi-tenant (organizações, membros, auditoria) com RLS;
- landing, login e shell do app;
- onboarding de 6 etapas (negócio, oferta, público, objetivo, identidade, revisão) que gera
  `businesses`, `offers` e `briefs` numa transação idempotente.

Fora do escopo (sem código, sem tabelas):
- qualquer leitura ou escrita no CRM;
- OAuth Meta, descoberta de contas, criação de campanhas, insights;
- cobrança SaaS e créditos;
- geração de estratégia e criativos com IA (próxima fase, antes da Meta).

## Garantias técnicas

- `META_ENABLED_IN_THIS_BUILD = false` em `src/lib/flags.ts`: mesmo com `META_MODE=real` ou flags
  ligadas por variável de ambiente, publicação real, criação de conta e WhatsApp Ads ficam
  desligadas (coberto por teste unitário).
- O app mostra "Simulação"/"Em breve" onde a Meta apareceria; nenhum botão simula conexão.

## Como reverter

Uma nova ADR libera a Meta, troca a constante e entrega os testes de contrato da versão fixada da
Graph API.
