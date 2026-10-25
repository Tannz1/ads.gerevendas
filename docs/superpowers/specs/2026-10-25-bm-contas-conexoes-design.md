# BM única: contas de anúncios e conexões (Spec 1 de 3) — design

Data: 25/10/2026. Base: `docs/05_META_PAGAMENTOS_SEGURANCA.md`, ADR 0004 (campanhas e conexão
Meta). Decisão de arquitetura em `docs/adr/0005-bm-unica-estoque-de-contas.md`.

## Objetivo

Todos os anúncios rodam numa única Business Manager (BM) da GereVendas. Cada cliente recebe uma
conta de anúncios própria dentro dessa BM e conecta a Página do Facebook e o Instagram dele pelo
app, sem abrir o Gerenciador de Negócios. A verba de mídia é cobrada pela Meta direto do cliente,
que cadastra cartão/Pix na tela oficial da Meta.

Critério de sucesso: com a BM da GereVendas e uma Página/Instagram de teste do operador, um
cliente percorre os 4 passos de `/app/conexoes` em modo real e termina com conta atribuída,
Página e Instagram com acesso `ADVERTISE`, admin da própria conta e forma de pagamento confirmada
pela API. Em Simulação, a mesma trilha roda ponta a ponta no E2E. Outra organização não vê a
conta, os ativos nem o estoque (RLS).

## Entrega em três specs

1. **Contas e conexões (esta spec):** System User, estoque de contas, Página/Instagram,
   convite do cliente, forma de pagamento.
2. **Publicação real:** upload de imagem, campanha/conjunto/anúncio `PAUSED`, ativação com a
   dupla confirmação existente, pausa.
3. **Acompanhamento:** status de revisão Meta, insights, reconciliação.

WhatsApp continua atrás de `FEATURE_FLAG_WHATSAPP_ADS` e fora desta spec.

## Fatos da Meta que restringem o desenho

Confirmados na documentação oficial (25/10/2026), ainda **não** provados por teste de contrato:

| Fato | Fonte | Consequência |
| --- | --- | --- |
| `POST /{business_id}/adaccount` cria até **5** contas pela API; as demais são manuais | guia Business Asset Management › Ad Accounts | Estoque abastecido por API enquanto houver cota e por importação de contas criadas no Business Suite |
| Cada BM tem um limite de criação de contas (começa em 1, sobe com gasto) | Business Suite › Informações do negócio | Estoque pode esgotar; cliente vê estado de espera |
| `POST /act_{id}/assigned_users` exige usuário **da BM** (`user`, `tasks`) | mesmo guia | Cliente é convidado para a BM como `EMPLOYEE` e recebe `MANAGE` só na conta dele |
| `POST /{business_id}/client_pages` (`page_id`, `permitted_tasks`); aprovação automática só se o solicitante for admin da Página, senão `PENDING` | guia Pages | Passo da Página trata aprovado e pendente; denúncias de spam podem bloquear a BM |
| `GET /{business_id}/client_instagram_assets` lista Instagram de clientes; tarefa `ADVERTISE` | guia Instagram Accounts | Como a BM obtém o acesso ao Instagram ligado à Página é **incerto** e decidido pelo teste de contrato |

Nenhum payload acima é tratado como fato no código antes de passar no teste de contrato real
(ver Testes).

## Jornada

### Operador (GereVendas)

1. Cria um System User admin na BM, gera o token com `ads_management`, `business_management`,
   `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement` e configura no servidor.
2. Em `/app/operador/estoque`: **Criar conta pela API** (enquanto houver cota; nome provisório,
   `currency=BRL`, `timezone_id` de São Paulo, `end_advertiser`/`media_agency`/`partner` = `NONE`)
   ou **Importar contas da BM** (lista `owned_ad_accounts` da BM, exclui as já registradas e as
   desativadas, insere como `available` com `source='imported'`).
3. Vê disponíveis / atribuídas / aposentadas, quantas organizações estão na fila de espera e
   um alerta quando as disponíveis ficam abaixo de
   `META_POOL_MIN_AVAILABLE` (padrão 2). Pode aposentar uma conta disponível.

### Cliente (`/app/conexoes`, trilha de 4 passos)

Cada passo mostra um destes estados: pendente, em andamento, aguardando ação na Meta, concluído, erro.

1. **Conta de anúncios.** Ao abrir a tela (`owner`), o app chama `assign_pool_account`. Com
   conta, renomeia na Meta para `"<nome do negócio> — GereVendas Ads"`. Sem estoque, mostra
   "Estamos preparando sua conta; volte em breve" e grava `pool_requested_at`, que alimenta a fila
   de espera no painel do operador. Sem promessa de e-mail enquanto o SMTP não estiver configurado.
2. **Conectar com Facebook.** Login do Facebook para Empresas (`config_id`). Com o token do
   cliente, o servidor lista as Páginas que ele administra e o Instagram ligado a cada uma; a
   sugestão usa `src/lib/meta-asset-match.ts`; o cliente confirma. O servidor, com o token do
   System User, pede `client_pages` com `["ADVERTISE","ANALYZE"]` e o acesso ao Instagram pelo
   caminho validado no teste de contrato. O token do cliente é descartado ao fim da requisição.
   Se ficar `PENDING`: "Aprove o pedido da GereVendas na Meta", com link e "Verificar agora".
3. **Aceitar convite da Meta.** O servidor convida o e-mail do cliente para a BM como `EMPLOYEE`.
   A tela explica que chega um e-mail da Meta. Quando o convite aparece como aceito, o servidor
   atribui `["MANAGE","ADVERTISE","ANALYZE"]` na conta do cliente e grava o
   `client_business_user_id`.
4. **Forma de pagamento.** Botão abre a tela oficial de pagamento da Meta para a conta. O passo só
   fica concluído quando a API mostra a conta com forma de pagamento; até lá, `billing_unverified`
   com orientação. O app nunca recebe dados de cartão nem Pix.

Publicar (Spec 2) só é liberado com os 4 passos concluídos.

## Dados (nova migration)

- `private.platform_operators (user_id uuid primary key references auth.users)` e
  `private.is_platform_operator() returns boolean` (security definer, `stable`). Inserção só por
  SQL administrativo; não há tela para virar operador.
- `public.meta_pool_status` enum: `available`, `assigned`, `retired`.
- `public.meta_ad_account_pool`:
  `id uuid pk`, `ad_account_id text unique` (`externalIdSchema`, formato `act_…`), `name`,
  `currency char(3)`, `timezone_id int`, `status meta_pool_status`, `organization_id uuid null
  references organizations unique`, `assigned_at`, `source text check in ('api','imported')`,
  `created_at`, `updated_at`; check `status='assigned'` ⇔ `organization_id is not null`.
  RLS: operador lê tudo; membro da organização lê só a própria linha. Sem insert/update/delete
  direto; tudo por RPC.
- RPCs (security definer, `search_path` fixo, auditoria em `audit_events`):
  - `assign_pool_account(p_org uuid)`: exige `owner` da organização; se já tem conta, devolve a
    mesma; senão `select … where status='available' order by created_at for update skip locked
    limit 1`, marca `assigned`, preenche `meta_connections.ad_account_*` e limpa
    `pool_requested_at`. Sem estoque grava `pool_requested_at` (se vazio) e devolve erro
    estruturado `pool_empty`. Ao registrar contas novas, o operador atribui à fila em ordem de
    `pool_requested_at` na próxima visita do cliente (sem job em segundo plano).
  - `register_pool_accounts(p_accounts jsonb)`, `retire_pool_account(p_id uuid)`: exigem operador.
  - `update_meta_onboarding_step(p_org uuid, p_step text, p_status text, p_payload jsonb)`:
    chamada só pelo servidor (service role) depois de cada resposta da Meta.
- `public.meta_connections` ganha: `ad_account_status`, `pool_requested_at timestamptz`
  (organização na fila de espera do estoque), `page_access_status`, `instagram_status`,
  `client_invite_status` (`not_sent|pending|accepted|expired`), `billing_status`
  (`unverified|verified`), `client_business_user_id text`, `last_checked_at`. Os status de
  passo usam o enum `meta_step_status` (`pending|in_progress|awaiting_meta|done|error`).
  `billing_verified_on_meta` passa a ser derivado de `billing_status` e é removido numa migration
  posterior, depois que nenhum código o ler.

Contratos Zod em `src/contracts/meta.ts` e seção nova em `docs/08_CONTRATOS.md`.

## Integração (`src/server/meta/`)

- `client.ts`: interface `MetaBusinessClient` (createAdAccount, listBusinessAdAccounts,
  renameAdAccount, listUserPages, requestPageAccess, requestInstagramAccess, getPageAccessStatus,
  inviteBusinessUser, getBusinessUserInvite, assignAdAccountUser, getFundingStatus).
- `real-client.ts`: `fetch` para `graph.facebook.com/v25.0` (`META_GRAPH_VERSION`), token do System
  User + `appsecret_proof` (HMAC-SHA256 do token com `META_APP_SECRET`), timeout, um retry com
  backoff só para 5xx/limite de taxa em leituras e chave de idempotência nas escritas. Respostas
  validadas por Zod; IDs mantidos como string opaca.
- `mock-client.ts`: Simulação determinística, `simulated: true` em tudo; a UI mostra o selo
  **Simulação**.
- `errors.ts`: `MetaErrorMapper` → `missing_permissions`, `token_expired`, `bm_account_limit`,
  `pending_approval`, `ad_account_disabled`, `rate_limited`, `meta_unavailable`, `unknown`.
  Log estruturado com `correlation_id`, código e subcódigo da Meta, nunca o token.
- `onboarding.ts`: orquestra os 4 passos, chama as RPCs e decide o próximo passo. Checagem de status
  ao abrir a tela e em "Verificar agora", no servidor, no máximo 1 checagem por organização a
  cada 15 s.
- `src/lib/meta-oauth.ts`: passa a montar o Login do Facebook para Empresas com `config_id`
  (`META_LOGIN_CONFIG_ID`); o callback deixa de salvar ativos e só devolve a lista para confirmação.

### Ambiente e flags

Novas variáveis de servidor: `META_BUSINESS_ID`, `META_SYSTEM_USER_TOKEN`, `META_LOGIN_CONFIG_ID`,
`META_POOL_MIN_AVAILABLE`. Já existentes: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`,
`META_MODE`.

- `META_ENABLED_IN_THIS_BUILD` passa a `true`.
- Cliente real só quando `META_MODE=real` **e** `FEATURE_FLAG_ACCOUNT_CREATION=true` **e** kill
  switch desligado; caso contrário, mock.
- `realPublishing` continua desligado até a Spec 2.
- Faltando variável obrigatória em modo real: erro de configuração explícito, sem cair em mock
  silenciosamente.

## Telas e estados

- `/app/conexoes`: trilha de 4 passos; estados loading, vazio (sem estoque), erro com ação,
  `missing_permissions` (refazer login), restrito (não-`owner` vê só leitura), aguardando Meta.
  Substitui o fluxo atual de escolher conta descoberta em `meta-connection-panel.tsx`.
- `/app/operador/estoque`: só operador (404 para os demais); contagens, lista, criar pela API,
  importar, aposentar, alerta de estoque baixo.
- Textos em pt-BR simples; nenhuma promessa de aprovação de anúncio pela Meta.

## Segurança

- Token do System User só em variável de servidor; fora do banco, dos logs, do bundle e dos testes.
- Token do cliente vive só na requisição do callback/confirmação; não é persistido.
- OAuth com `state` assinado (já existe), callback exato, cookie httpOnly/SameSite.
- Operador: checagem server-side + RLS; ações de estoque auditadas.
- Kill switch interrompe qualquer chamada de escrita à Meta.
- Cada pedido de acesso à Página é feito uma vez por organização e Página (idempotente), para
  reduzir o risco de denúncia de spam contra a BM.

## Testes

- **Unitários:** `MetaErrorMapper`, `appsecret_proof`, transições de estado dos passos, resolução de
  flags/modo, validação Zod das respostas.
- **RLS (`supabase/rls-tests/80_meta_pool_rls.test.sql`):** cliente não lê o estoque nem a conta de
  outra organização; não-operador não chama RPCs de estoque; `member` não chama
  `assign_pool_account`; duas atribuições simultâneas não pegam a mesma conta; atribuição repetida
  devolve a mesma conta.
- **E2E (Simulação):** trilha completa em `/app/conexoes`, estoque vazio, Página pendente, tela do
  operador.
- **Contrato real (manual, `npm run test:meta-contract`, fora do CI):** com a BM e uma
  Página/Instagram do operador: criar conta (gasta 1 da cota de 5, rodar só com flag explícita),
  listar contas da BM, renomear, `client_pages`, acesso ao Instagram, convite, `assigned_users`,
  forma de pagamento. Resultado e versão da API registrados no ADR 0005. Só depois disso o modo
  real pode ser ligado em produção.

## Dependências externas (fora do código)

1. System User admin na BM e token com as permissões acima (operador).
2. Configuração do Login do Facebook para Empresas no App (`config_id`).
3. App Review / Advanced Access de `ads_management`, `business_management`, `pages_show_list`,
   `pages_manage_metadata`, `pages_read_engagement`, gravado com o fluxo desta spec. Até a
   aprovação, o modo real funciona só com contas que têm papel no App.

## Fora do escopo

Publicação, ativação e insights (Specs 2 e 3); WhatsApp; criação de Página ou Instagram para o
cliente; uso da conta de anúncios própria do cliente; pagamento de mídia pela GereVendas.
