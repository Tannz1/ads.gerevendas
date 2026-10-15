# Deploy na VPS com EasyPanel

O repositório tem um `Dockerfile` pronto (Next.js standalone, Node 22, usuário sem privilégios,
healthcheck em `/api/health`). O EasyPanel builda direto do GitHub.

## 1. Criar o serviço

1. **Projects → Create project** (ex.: `gerevendas`).
2. **+ Service → App**, nome `ads`.
3. Aba **Source → GitHub**:
   - Owner: `Tannz1`
   - Repository: `ads.gerevendas`
   - Branch: `main`
   - Build path: `/`
   - Repositório privado? Configure antes um token do GitHub em **Settings → GitHub** do EasyPanel.
4. Aba **Build**: escolha **Dockerfile** (arquivo `Dockerfile`).
5. Clique em **Deploy**.

## 2. Domínio

1. No seu DNS, crie um registro **A**: `ads` → IP da VPS (para `ads.gerevendas.com.br`).
2. No serviço, aba **Domains → Add domain**: host `ads.gerevendas.com.br`, **porta 3000**, HTTPS ligado.
   (Para testar antes do DNS, use o domínio gratuito que o EasyPanel sugere.)

## 3. Variáveis de ambiente

Sem nenhuma variável o app sobe em **modo demonstração** (sem login, dados só no navegador,
rotulado DEMO). Para ligar contas reais, na aba **Environment**:

```
NEXT_PUBLIC_APP_URL=https://ads.gerevendas.com.br
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
FEATURE_FLAG_PILOT_MODE=true
```

As variáveis `NEXT_PUBLIC_*` são embutidas no build: depois de alterá-las, faça **Deploy** de novo.
Não coloque a service role key do Supabase nem chaves da Meta/OpenAI nesta fase.

## 4. Deploy automático

Na aba **Deployments**, ative **Auto Deploy** para publicar a cada push no `main`.

## Verificação

- `https://ads.gerevendas.com.br/api/health` deve responder `{"ok":true,...}`.
- A página inicial abre; `/app` mostra a faixa "Modo demonstração" enquanto o Supabase não estiver
  configurado.
