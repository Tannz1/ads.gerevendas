# Deploy na VPS com EasyPanel — `gerevendas.com.br/ads`

O GereVendas Ads roda como **um serviço próprio** no mesmo EasyPanel do CRM e responde no mesmo
domínio, no caminho `/ads`. O proxy do EasyPanel (Traefik) manda `gerevendas.com.br/ads/*` para o
Ads e todo o resto continua indo para o CRM. O container do CRM não é alterado (regra do
`AGENTS.md`: Ads isolado do CRM nesta fase).

O `Dockerfile` já vem com o padrão de produção: `NEXT_PUBLIC_BASE_PATH=/ads` e
`NEXT_PUBLIC_APP_URL=https://gerevendas.com.br`.

## 1. Criar o serviço

1. Abra o **mesmo projeto** do EasyPanel onde está o CRM (ou crie um novo; tanto faz para o roteamento).
2. **+ Service → App**, nome `ads`.
3. **Source → GitHub**: owner `Tannz1`, repositório `ads.gerevendas`, branch `main`, build path `/`.
   Repositório privado? Configure antes um token do GitHub em **Settings → GitHub** do EasyPanel.
4. **Build**: **Dockerfile**.
5. **Deploy**.

## 2. Domínio com caminho

No serviço `ads`, aba **Domains → Add domain**:

| Campo | Valor |
| --- | --- |
| Host | `gerevendas.com.br` |
| Path | `/ads` |
| Port | `80` (o EasyPanel define PORT=80 no container) |
| HTTPS | ligado |

Se aparecer uma opção para remover o prefixo do caminho (*strip path*), deixe **desligada**: o app
espera receber as requisições já com `/ads`.

O domínio do CRM (`gerevendas.com.br` sem caminho) continua como está. A regra mais específica
(`/ads`) tem prioridade automaticamente.

> Se o `gerevendas.com.br` **não** estiver neste EasyPanel (por exemplo, hospedado na Vercel), o
> roteamento de `/ads` precisa ser feito no host do domínio principal (rewrite para o serviço do Ads).

## 3. Variáveis de ambiente

Sem Supabase o app sobe em **modo demonstração** (sem login, dados só no navegador, rotulado DEMO).
Para ligar contas reais, aba **Environment**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
FEATURE_FLAG_PILOT_MODE=true
```

As variáveis `NEXT_PUBLIC_*` entram no build (o Dockerfile as recebe como build args): depois de
alterá-las, faça **Deploy** de novo. Use um Supabase **exclusivo do Ads**, não o banco do CRM nem de
outro projeto. Não coloque service role key nem chaves da Meta/OpenAI nesta fase.

### Vídeo com avatar (ADR 0008)

Só no servidor (aba **Environment**, nunca `NEXT_PUBLIC_*`), depois de aplicar as migrations
`20261027120000_video_enums.sql` e `20261027120100_video_avatar.sql`:

```
ELEVENLABS_API_KEY=<chave com Text to Speech, Flows e Assets>
ELEVENLABS_VOICE_IDS=<voice_id 1>,<voice_id 2>
```

Vídeo pela API exige plano **Pro** na ElevenLabs. Sem a chave ou sem vozes, a seção de vídeo aparece
desativada e a publicação continua só com imagem. O kill switch também desliga o vídeo.

Para servir em outro lugar (ex.: subdomínio próprio na raiz), defina `NEXT_PUBLIC_BASE_PATH=` vazio e
`NEXT_PUBLIC_APP_URL` com a nova origem.

### Supabase self-hosted do Ads

`infra/supabase/` tem um Supabase enxuto (Postgres, Auth, PostgREST, Storage, gateway Caddy) que
aplica `supabase/migrations` a cada deploy. No EasyPanel: serviço **Compose** `ads-supabase`, source
Git deste repo, branch `main`, compose file `infra/supabase/docker-compose.yml`. Domínio apontando
para o compose service `ads-gateway`, porta `8000`. Variáveis (aba Environment): `POSTGRES_PASSWORD`,
`JWT_SECRET`, `JWT_EXPIRY`, `ANON_KEY`, `SERVICE_ROLE_KEY` (JWTs HS256 assinados com `JWT_SECRET`),
`SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL` (`<SUPABASE_PUBLIC_URL>/auth/v1`), `SITE_URL`,
`ADDITIONAL_REDIRECT_URLS` e `SMTP_*` (sem SMTP o link mágico não é enviado).

## 4. Deploy automático

Aba **Deployments → Auto Deploy** para publicar a cada push no `main`.

## Verificação

- `https://gerevendas.com.br/ads/api/health` → `{"ok":true,...}`
- `https://gerevendas.com.br/ads` abre a página do Ads; `https://gerevendas.com.br` continua no CRM.
