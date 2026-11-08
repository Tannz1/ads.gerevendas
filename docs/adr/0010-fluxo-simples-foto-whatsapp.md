# ADR 0010 — Fluxo simples "Da foto ao cliente no WhatsApp"

- **Status:** aceito
- **Data:** 08/11/2026
- **Relacionados:** ADR 0003 (criativos), ADR 0004/0006 (campanhas), ADR 0009 (conta compartilhada)

## Contexto

O fluxo atual (cadastro de 6 etapas → estratégia com 5 peças → editor → aprovação → campanha) é
completo, mas pede muitas decisões ao dono de negócio local. O produto definiu um caminho curto,
pensado para o celular, em 8 telas: Início, Produto, Oferta, Prévia, Região, Investimento,
Publicação e Resultados. Decisões do produto em 08/11/2026: o fluxo entra **ao lado** do atual (que
continua como modo completo), **mantém as 5 peças** e usa **identidade verde**.

## Decisão

1. **Produto = oferta com foto.** `offers.photo_asset_id` aponta para um asset `photo` (com
   declaração de direito de uso), registrado por `register_product_photo` antes de existir peça.
   `create_product_brief` cria oferta + brief `submitted` numa transação, herdando negócio, público
   e idades do cadastro concluído; objetivo sempre `mensagens_whatsapp` (exige WhatsApp no cadastro).
   `briefs.request_key` torna a criação idempotente e marca o brief como do fluxo simples.
2. **Fatos.** Preço e destaques (parcelamento, desconto, entrega) são digitados e confirmados pelo
   dono; viram `price_cents` e `differentiators`, que a checagem de fatos já aceita. A IA não cria
   preço, desconto nem condição que o dono não escreveu.
3. **Peças.** A estratégia gera as 5 peças de sempre. Com foto do produto, a foto vai nas 5 e não se
   gera imagem com IA. O dono vê as 5 na prévia e "Gostei, continuar" aprova as 5; editar uma peça a
   devolve para rascunho (regra existente) e a prévia pede nova aprovação.
4. **Região.** A Meta recebe a cidade do cadastro com raio (17 a 80 km, `campaign-payload.ts`). A
   tela oferece "Na cidade" (17 km) e "Cidade e região" (40 km), gravados em `briefs.service_radius_km`.
   Raio em volta do endereço da loja exige `custom_locations` com latitude/longitude, formato ainda
   sem teste de contrato real: **fica fora** até esse teste existir. O mapa da tela é ilustrativo.
5. **Publicação.** Reusa `publishPausedCampaign`: campanha sempre `PAUSED`, só o `owner`, com as duas
   confirmações (verba e categorias especiais). Na conta compartilhada a tela informa que a ativação
   acontece depois do pagamento da verba à GereVendas (ADR 0009); fora dela, a ativação é a segunda
   confirmação do dono na tela de resultados.
6. **Vendas registradas.** `sales_records` guarda vendas declaradas pelo dono por campanha (só por
   RPC: `record_sale`, `delete_sale`), com RLS por organização e entrada na exportação LGPD. A tela
   sempre diz que são registradas pelo dono; não são dado da Meta.
7. **Separação.** O modo completo (Criativos, Nova campanha) lê só briefs sem `request_key`; o fluxo
   simples lê só briefs com `request_key`. O Início, com cadastro concluído, passa a ser a tela 1.

## Consequências

- Migration aditiva `20261108120000_fluxo_simples.sql`; testes em `supabase/rls-tests/99_fluxo_simples_rls.test.sql`.
- Pendências: raio em volta da loja (teste de contrato de `custom_locations`), cobrança da verba no
  app (gateway), WhatsApp editável no próprio fluxo.

## Rollback

Reverter o código volta o Início e esconde as telas novas. A migration é aditiva: colunas e tabela
novas podem ficar sem uso; para remover, `drop table sales_records`, `drop function` das 4 RPCs,
`alter table offers drop column photo_asset_id`, `alter table briefs drop column request_key` e
recriar `export_organization_data` da migration `20261020110000`.
