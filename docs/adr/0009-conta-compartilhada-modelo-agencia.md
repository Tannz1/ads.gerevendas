# ADR 0009 — Conta de anúncios compartilhada (modelo agência)

- **Status:** aceito; publicação real depende do teste de contrato e da cobrança da verba
- **Data:** 30/10/2026
- **Substitui em parte:** ADR 0005, itens 1 e 3 (estoque de contas por cliente, convite para a BM e
  pagamento da mídia pelo cliente direto na Meta), quando `META_SHARED_AD_ACCOUNT_ID` está configurada.

## Contexto

O estoque de contas do ADR 0005 exige uma conta de anúncios por cliente, convite para a BM e
cadastro do pagamento na Meta. O produto decidiu operar como agência: todas as campanhas rodam na
conta "BM 001" (`act_695554463402399`) do portfólio "Nathan Projects" (`1087814973211807`), cada
campanha leva o nome da empresa, e o painel de cada cliente mostra só as próprias campanhas.

## Decisão

1. Com `META_SHARED_AD_ACCOUNT_ID` configurada, o passo "conta de anúncios" vincula a empresa a
   essa conta (`meta_assign_shared_account`, só service role; o ID vem da configuração, nunca do
   navegador). `meta_connections.shared_account = true`.
2. A conexão fica pronta com conta + Página. Não há convite para a BM nem pagamento do cliente na
   Meta. O estoque continua no código para o modelo de conta própria.
3. **Pagamento da mídia:** o cliente paga a verba à GereVendas; a GereVendas paga a Meta pela forma
   de pagamento da BM 001. Isso muda o guardrail "a GereVendas não paga nem repassa mídia" do
   AGENTS.md. A cobrança da verba no app depende da escolha do gateway (pendente).
4. **Teto por cliente:** o conjunto de anúncios usa `lifetime_budget` = orçamento diário × dias.
   A Meta nunca gasta além do orçamento total. O `spend_cap` de campanha não serve porque a Meta
   exige no mínimo US$ 100. Na ativação, o período é refeito a partir de agora para o ritmo diário
   continuar igual ao confirmado.
5. **Quem ativa:** na conta compartilhada só um operador da plataforma ativa a veiculação, depois de
   confirmar o pagamento da verba. O dono continua confirmando orçamento e duração.
6. **Isolamento:** métricas são lidas por campanha (`{campaign_id}/insights`) e gravadas com o
   `organization_id`; nada é lido no nível da conta para o cliente. RLS cobre `meta_connections`.
7. Campanhas na Meta recebem o nome `<Empresa> — <campanha>` para identificação no Gerenciador.

## Consequências e riscos

- **Risco concentrado maior que no ADR 0005:** uma restrição na BM 001 para todos os clientes ao
  mesmo tempo. Mitigações: revisão humana, kill switch e limite de gastos da conta na Meta.
- **Fluxo de caixa:** a GereVendas adianta a mídia. Ativar só com a verba paga evita prejuízo.
- **Fiscal e contrato:** repasse de mídia exige ajuste de contrato e nota fiscal (modelo agência).
- **Operador como owner:** hoje o operador precisa ser owner da empresa para ativar. Ativar
  campanhas de clientes pelo painel do operador entra com a cobrança da verba.
- **Payload novo:** `lifetime_budget` e a atualização do período na ativação precisam do teste de
  contrato real (publicação pausada) antes de ligar `FEATURE_FLAG_REAL_PUBLISHING`.
