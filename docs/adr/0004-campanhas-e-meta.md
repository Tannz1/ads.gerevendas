# ADR 0004 — Campanhas, Conexão Meta e Dupla Confirmação de Orçamento (M3)

- **Status:** aceito
- **Data:** 20/10/2026

## Contexto

O Milestone 3 (`docs/05_META_PAGAMENTOS_SEGURANCA.md`, `docs/02_UX_UI.md` telas H, I, J) exige o fluxo
completo de conexão de ativos Meta, configuração de campanha com orçamento em centavos (BRL),
publicação inicialmente `PAUSED` e ativação controlada apenas pelo proprietário (`owner`) da
organização. Como o aplicativo Meta em produção e o spike de homologação de terceiros ainda estão
bloqueados externamente, o sistema deve operar com separação estrita entre o modo `mock` (sempre
rotulado visualmente como **Simulação**) e o adaptador `real`, mantendo `META_ENABLED_IN_THIS_BUILD = false`
até a conclusão da homologação oficial na Meta.

## Decisão

1. **Separação estrita de livros financeiros:**
   - A assinatura do GereVendas Ads (`R$ 199/mês`) e a verba de mídia da Meta são apresentadas em
     caixas separadas em toda tela de publicação e campanha.
   - O GereVendas Ads **nunca** recolhe Pix/cartão para recarregar saldo Meta; o pagamento de mídia
     ocorre exclusivamente no ambiente oficial da Meta.

2. **Máquina de estados da campanha (`campaign_status`):**
   - `draft` → criada internamente mas ainda não publicada.
   - `paused` → publicada inicialmente pausada (`publish_campaign_paused`). **Toda campanha nasce
     obrigatoriamente em `paused`** (guardrail inegociável de `AGENTS.md`).
   - `active` → ativada somente após uma **segunda confirmação explícita** do `owner` (`activate_campaign`),
     validando o mesmo snapshot de orçamento (`budget_cents`) e duração (`duration_days`).
   - `ended` → encerrada.

3. **Controle de permissão e RLS no banco:**
   - Leitura de conexões Meta e campanhas: qualquer membro da organização (`private.is_org_member`).
   - Escrita, publicação `paused`, ativação e alteração de status: exclusivamente por RPCs que
     exigem papel `owner` (`private.has_org_role(..., array['owner'])`) quando há compromisso de
     orçamento ou ativação, e `owner`/`admin` para pausar uma campanha em andamento.
   - Todas as peças vinculadas a uma campanha (`campaign_creatives`) devem estar com `status = 'approved'`
     e pertencer à mesma organização (FK composta + verificação na RPC).

4. **Idempotência e rastreabilidade:**
   - Tabela `publication_operations` grava `idempotency_key`, `operation` (`publish_paused` |
     `activate` | `pause`), `request_hash`, `simulated` e IDs opacos retornados (`externalIdSchema`).
   - Em modo `mock`, `simulated = true` é persistido na conexão, na campanha e na operação, e a UI
     exibe o badge **Simulação** em todos os pontos.
   - Métricas de conversas/resultados nunca exibem `0` inventado quando indisponíveis; a UI informa
     explicitamente quando a métrica não está disponível no modo atual.

## Consequências

- O empreendedor e a equipe do piloto já conseguem percorrer toda a jornada (Criativos aprovados →
  Conexão de conta/página/WhatsApp → Criação de campanha `PAUSED` com confirmação de verba →
  Ativação em segunda etapa → Pausa/Retomada), com persistência real no Postgres e isolamento
  multi-tenant testado em `supabase/rls-tests`.
- Para ligar a publicação real na Graph API após o spike M0, basta implementar o cliente HTTP na
  interface do provedor Meta e alterar `META_ENABLED_IN_THIS_BUILD` em nova revisão.
