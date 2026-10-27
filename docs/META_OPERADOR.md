# Guia do operador — BM única da GereVendas (ADR 0005)

Passo a passo para ligar o modo real das contas e conexões Meta. Nada aqui exige App Review: o app só
opera ativos da própria BM da GereVendas. Os nomes de menus da Meta mudam com frequência; se algum
não bater, procure a opção equivalente.

## 1. Conferir o App

1. Em developers.facebook.com › seu App › Configurações › Básico, confira:
   - tipo do App: **Empresa**;
   - portfólio empresarial vinculado: a BM verificada da GereVendas.
2. Anote o **ID do App** e a **Chave secreta do App** (`META_APP_ID`, `META_APP_SECRET`).

## 2. Criar o System User

1. Business Suite › Configurações › Usuários › **Usuários do sistema** › Adicionar.
2. Nome: `gerevendas-ads-servidor`. Função: **Administrador**.
3. Em "Atribuir ativos", dê ao System User:
   - o App (controle total);
   - as contas de anúncios que vão para o estoque (controle total).

## 3. Gerar o token

1. No System User, clique em **Gerar token**, escolha o App e marque:
   `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`.
2. Se houver opção de validade, escolha a que não expira.
3. Cole o token **só** no `.env.local` (e depois no EasyPanel). Nunca no chat, em commit, print ou
   mensagem.

## 4. Variáveis

No `.env.local` (desenvolvimento) e no serviço `ads` do EasyPanel (produção):

```bash
META_MODE=real
FEATURE_FLAG_ACCOUNT_CREATION=true
META_APP_ID=...
META_APP_SECRET=...
META_BUSINESS_ID=...          # ID da BM (Business Suite › Configurações › Informações do negócio)
META_SYSTEM_USER_TOKEN=...
META_AD_ACCOUNT_TIMEZONE_ID=  # opcional: só para "Criar 1 conta pela API"
META_POOL_MIN_AVAILABLE=2
```

`SUPABASE_SERVICE_ROLE_KEY` também é obrigatória: o servidor grava com ela o que a Meta confirmou.

## 5. Teste de contrato (antes de abrir para clientes)

Prepare uma Página e um Instagram profissional em **outro** portfólio empresarial (simulando um
cliente) e compartilhe os dois com a BM da GereVendas como parceiro, com permissão de anúncios.

Leituras (não alteram nada):

```bash
META_CONTRACT_PAGE_URL="https://www.facebook.com/suapaginadeteste" \
META_CONTRACT_INSTAGRAM="@seuinstagramdeteste" \
META_CONTRACT_AD_ACCOUNT_ID="act_..." \
META_CONTRACT_INVITE_EMAIL="voce@exemplo.com" \
npm run test:meta-contract
```

Escritas (enviam convite real, renomeiam a conta de teste):

```bash
META_CONTRACT_WRITE=1 ...as mesmas variáveis... npm run test:meta-contract
```

- `META_CONTRACT_CREATE_ACCOUNT=1` cria uma conta pela API e **gasta 1 da cota de 5** da BM.
- `META_CONTRACT_BUSINESS_USER_ID=...` (o ID que aparece no teste de convite depois de aceito)
  testa a atribuição de administrador na conta.
- `META_CONTRACT_VIDEO_URL=https://...mp4` (com `META_CONTRACT_PUBLISH=1`) publica a peça de teste
  como vídeo: prova `advideos`, o processamento e o criativo com `video_data` (ADR 0008). Use um MP4
  curto em URL pública. As permissões são as mesmas da imagem (`ads_management`).

Confira também, abrindo no navegador:

- o link de parceiros e o de pagamento em `src/lib/meta-links.ts` levam às telas certas;
- depois de aceitar o convite, o e-mail aparece igual em `business_users` (o teste de convite
  mostra `accepted`).

Copie as linhas `[contrato v25.0]` da saída para a seção "Resultados do teste de contrato real" do
`docs/adr/0005-bm-unica-estoque-de-contas.md`. Se alguma chamada falhar por falta de acesso
avançado, pare e reavalie antes de ligar o modo real em produção.

## 6. Virar operador

No editor SQL do Supabase do Ads:

```sql
insert into private.platform_operators (user_id)
select id from auth.users where email = 'seu-email@gerevendas.com.br';
```

Depois abra `/app/operador/estoque` (a página não aparece no menu).

## 7. Abastecer o estoque

1. Crie contas de anúncios no Business Suite (em BRL, fuso de São Paulo) só para clientes. O limite
   de criação da BM aparece em Configurações › Informações do negócio.
2. Atribua cada conta ao System User.
3. Em `/app/operador/estoque`, clique em **Buscar contas da BM**, marque só as contas para clientes
   e registre. Nunca registre a conta de anúncios da própria GereVendas.
4. O painel avisa quando há menos contas livres que `META_POOL_MIN_AVAILABLE` e quantas empresas
   estão na fila.

## 8. Painel do cliente e publicação

O cliente acessa `/app/painel` pelo menu **Resultados**. A conta e as métricas são da empresa da sessão, compartilhadas com seus membros. A atualização é manual e mostra cobertura e data dos dados; Simulação não gera métricas.

Antes de liberar publicação real, aplicar a migration aditiva `20261026140000_painel_publicacao_segura.sql` no projeto isolado do Ads, executar os testes de banco e homologar a publicação pausada. A nova migration não foi aplicada automaticamente ao ambiente remoto. O contrato de publicação, as variáveis necessárias, as restrições e o procedimento de recuperação estão no [ADR 0007](adr/0007-painel-e-execucao-segura.md).

Não liberar uma execução pendente apenas por estar antiga: pode haver um objeto criado na Meta cujo ID não foi salvo. Conferir e reconciliar antes de retomar. Se uma ativação ficou incerta, interromper a veiculação no ambiente oficial da Meta e confirmar a pausa antes de qualquer nova autorização.
