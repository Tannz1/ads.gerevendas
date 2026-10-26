# ADR 0006 — Publicação real na Meta e acompanhamento

- **Status:** aceito (código pronto; modo real depende do teste de contrato)
- **Data:** 25/10/2026
- **Depende de:** ADR 0004 (campanhas, dupla confirmação), ADR 0005 (BM única)

## Contexto

Com a conexão da BM pronta (ADR 0005), falta criar de fato campanha, conjunto e anúncios na conta do
cliente, ativar e pausar na Meta e trazer de volta o status de revisão e as métricas. O AGENTS.md
proíbe tratar payload da Meta como fato sem teste de contrato real, então o código fica pronto mas o
modo real só liga com `FEATURE_FLAG_REAL_PUBLISHING=true` depois do teste.

## Decisão

1. **Publicação em etapas retomáveis.** `start_real_publication` (owner) cria a campanha em `draft`
   com o snapshot de orçamento. O servidor então, com o token do System User, envia a imagem de cada
   peça (`adimages`), cria campanha, conjunto, criativos e anúncios, todos `PAUSED`, e grava cada ID
   assim que a Meta devolve (`meta_record_publication`, só `service_role`). Uma nova tentativa com a
   mesma chave pula o que já tem ID. Só quando tudo existe, `meta_finish_publication` muda para
   `paused` / `pending_review`. Campanha em `draft` real aparece como "publicação incompleta" com
   botão de retomar.
2. **Payload (Graph v25.0), isolado em `src/server/meta/campaign-payload.ts`:**
   - campanha: `objective` por objetivo do brief, `status=PAUSED`, `special_ad_categories=[]`
     (o dono confirma que o anúncio não é de crédito, emprego, moradia, política ou tema social;
     essas categorias ficam bloqueadas);
   - conjunto: `daily_budget` em centavos de BRL, `billing_event=IMPRESSIONS`,
     `bid_strategy=LOWEST_COST_WITHOUT_CAP`, idade do brief, cidade do negócio com o raio do brief
     (10–80 km) via busca `adgeolocation`; cidade não encontrada é erro, nunca vira "Brasil inteiro";
   - criativo: `object_story_spec.link_data` com imagem, título, texto e botão; Instagram ligado
     quando existir;
   - destino: site (tráfego), perfil do Instagram (visitas ao perfil) ou link do WhatsApp `wa.me`.
     O objetivo "Conversas no WhatsApp" da Meta exige homologação: até lá, a campanha usa tráfego para
     o link do WhatsApp e a tela avisa isso antes da publicação.
3. **Ativar e pausar na Meta primeiro.** Ativar muda campanha, conjunto e anúncios para `ACTIVE` e só
   então grava no banco; se o banco falhar, o servidor devolve tudo para `PAUSED`. A ativação deixa de
   marcar "aprovada pela Meta" por conta própria: o status de revisão vem só da Meta.
4. **Acompanhamento sob demanda.** "Atualizar dados da Meta" (e a abertura da tela, no máximo a cada
   60 s) lê `effective_status` dos anúncios e `insights` da campanha e grava em
   `campaign_insights`. Em Simulação não há métricas: a tela diz isso em vez de mostrar zero.

## Consequências

- Até o teste de contrato, `FEATURE_FLAG_REAL_PUBLISHING` fica desligada e a publicação continua em
  Simulação rotulada.
- Campos com maior risco de diferença na v25.0 (nome do campo de Instagram no criativo, exigências
  de orçamento no nível do conjunto) estão concentrados num único arquivo e cobertos pelo teste de
  contrato `META_CONTRACT_PUBLISH=1`, que cria uma campanha pausada de verdade numa conta de teste.
- Métricas não atualizam sozinhas em segundo plano; um job periódico fica para quando houver volume.
