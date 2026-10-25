# ADR 0005 — BM única da GereVendas com estoque de contas de anúncios

- **Status:** aceito
- **Data:** 25/10/2026
- **Substitui em parte:** `docs/05_META_PAGAMENTOS_SEGURANCA.md` (itens "Conta, página, WhatsApp e
  portfólio pertencem ao cliente" e "Não há requisito de criar Ad Account automaticamente") e o
  fluxo de descoberta de contas do cliente do ADR 0004.

## Contexto

Pedir que o dono de negócio local tenha uma conta de anúncios configurada no próprio portfólio
empresarial trava a maioria dos clientes antes do primeiro anúncio. O produto decidiu concentrar
as contas de anúncios na BM verificada da GereVendas e deixar o cliente só conectar Página e
Instagram e cadastrar o pagamento na Meta.

A Meta limita a criação de contas: até 5 pela API (`POST /{business_id}/adaccount`) e um limite
por BM que começa baixo e cresce com o gasto.

## Decisão

1. Contas de anúncios pertencem à BM da GereVendas e ficam num **estoque** (`meta_ad_account_pool`)
   abastecido pelo operador (API enquanto houver cota, importação de contas criadas no Business
   Suite). O app atribui uma conta por organização, de forma atômica.
2. Página e Instagram continuam do cliente. O próprio cliente os compartilha com a BM como
   parceiro no Business Suite, guiado pelo app, e informa o link da Página; o app só lê
   `client_pages`/`client_instagram_assets` da própria BM. O app não envia pedidos de acesso
   (denúncias de spam bloqueiam a BM).
3. O cliente entra na BM como `EMPLOYEE` com `MANAGE` só na própria conta, para cadastrar a
   forma de pagamento na tela oficial da Meta. A Meta cobra a mídia direto do cliente; a
   GereVendas não paga nem repassa mídia (guardrail do AGENTS.md mantido).
4. O servidor usa um token de System User da BM, só em variável de ambiente e com
   `appsecret_proof`. Não há login do Facebook do cliente no app; o app não recebe token de
   cliente.
5. **Sem App Review.** O App é do tipo Empresa (acesso padrão automático a todas as permissões) e
   só opera ativos da própria BM, caso em que a Meta documenta que o acesso padrão a
   `ads_read`/`ads_management` basta. A faixa Limited→Full da Marketing API sobe por uso, sem
   revisão. Se o teste de contrato mostrar alguma chamada bloqueada no acesso padrão, a decisão
   volta para o produto antes de ligar o modo real.
6. Graph/Marketing API fixada em `v25.0` (`META_GRAPH_VERSION`). Payloads só viram fato depois do
   teste de contrato real; resultados registrados abaixo.

## Consequências e riscos

- **Risco concentrado:** violação de política de um cliente pode restringir a BM inteira e
  derrubar todos. Mitigações: revisão humana em categorias especiais, nenhum pedido de acesso
  enviado pelo app (denúncias de spam bloqueiam a BM), kill switch.
- **Escala limitada pelo limite da BM:** estoque vazio vira estado de espera visível e alerta ao
  operador; crescimento depende de a Meta subir o limite.
- **Atrito:** o cliente segue um passo a passo no Business Suite para compartilhar Página e
  Instagram e aceita um e-mail da Meta para entrar na BM. É o preço de não depender de App Review.
- **Vínculo por link:** uma Página compartilhada com a BM é vinculada à organização que informar
  o link primeiro; índice único, auditoria e desvínculo pelo operador cobrem disputas.
- **Saída do cliente:** a conta de anúncios fica na BM da GereVendas; o cliente leva Página e
  Instagram. A política de transferência ou encerramento da conta precisa entrar nos termos.

## Resultados do teste de contrato real

Pendente. Preencher com data, versão da API e resultado de cada endpoint da spec
`docs/superpowers/specs/2026-10-25-bm-contas-conexoes-design.md`.
