# ADR 0008 — Vídeo com avatar falante (ElevenLabs)

- **Status:** implementado; depende de chamada real à ElevenLabs e de teste de contrato de vídeo na Meta
- **Data:** 27/10/2026
- **Complementa:** ADR 0003.

## Contexto

Além das peças estáticas, o cliente quer um vídeo curto em que um avatar com a própria foto fala o
roteiro do anúncio. A ElevenLabs oferece TTS em pt-BR e, desde 17/08/2026, geração de vídeo pela API
(Flows). O modelo `creatify-aurora` anima uma foto a partir de um áudio de fala. Vídeo pela API exige
plano **Pro**; o Starter só cobre TTS.

## Decisão

- **Provedor:** `src/server/ai/elevenlabs.ts`, via `fetch` sem SDK, igual aos provedores OpenAI.
  Header `xi-api-key`. Chave só no servidor (`ELEVENLABS_API_KEY`). Sem chave ou com kill switch não
  há provedor, e não existe vídeo simulado.
- **Fluxo:** a IA propõe o roteiro (até 600 caracteres, cerca de 40 s). O cliente aprova o texto.
  O TTS gera o MP3. Depois `POST /v1/flows/video` recebe `creatify-aurora`, a foto e o áudio em
  `inline_base64`, com 720p. O job consulta `GET /v1/flows/video/{id}` no máximo a cada 10 s até
  `completed` ou `failed`. O MP4 é copiado para o Storage privado, porque `content_url` expira em
  cerca de 1 h.
- **Sem retry na criação:** a API não documenta chave de idempotência. Repetir a criação após timeout
  ou 5xx poderia cobrar dois vídeos. Só TTS e consulta têm uma nova tentativa.
- **Consentimento:** a foto precisa ser do próprio usuário ou de alguém que autorizou o uso. A
  declaração fica registrada com data e usuário, como a declaração de direito de uso das fotos (M2).
  Rosto de terceiro sem autorização é proibido.
- **Conteúdo:** o roteiro segue a mesma checagem de fatos das peças. O avatar não fala preço,
  resultado, depoimento ou garantia que o cliente não confirmou.

## Implementação

- **Banco** (`20261027120000_video_enums.sql`, `20261027120100_video_avatar.sql`): job `video` em
  `generation_jobs`, sempre cobrável, com limite de 20 por mês. Tabela `videos` com RLS. A peça
  ganha `video_id`, e trocar o vídeo de uma peça aprovada volta para rascunho. Bucket privado
  `creative-videos`, até 50 MB e só `video/mp4`. A foto vira `assets` do tipo `photo`, com direito de
  uso; o consentimento do rosto fica em `videos.likeness_consent_at`. Testes em
  `supabase/rls-tests/97_video_avatar_rls.test.sql`.
- **Job:** `startAvatarVideo` valida a entrada, checa os fatos do roteiro, sobe a foto e abre o job.
  Em `after()` gera o TTS, pede o avatar e grava o `external_generation_id`. A conclusão vem de
  `checkVideoJob`, chamado pelo polling da tela a cada 10 s. Ele consulta a geração, baixa o MP4
  (confere `ftyp` e tamanho) e grava em `{org}/{job_id}.mp4`. Assim o vídeo sobrevive a reinício do
  container, sem pagar uma nova geração. Job com ID externo não expira por tempo.
- **Meta:** peça com vídeo ganha a etapa `video:{creative_id}`. `POST /{ad_account_id}/advideos` com
  `file_url` (URL assinada do Storage, 1 h) e o ID gravado em `campaign_creatives.external_video_id`.
  Depois `GET /{video_id}?fields=status` até `ready`, no máximo cerca de 3 min; se passar disso, a
  publicação para com `video_processing` e é retomada depois. Por fim o criativo com
  `object_story_spec.video_data` (`video_id`, `image_hash` da arte como capa, `title`, `message`,
  `call_to_action`). Tudo continua `PAUSED`. As permissões são as mesmas da imagem
  (`ads_management`).

## Pendente (antes de produção)

- Teste de contrato real: `META_CONTRACT_PUBLISH=1 META_CONTRACT_VIDEO_URL=...` (docs/META_OPERADOR.md).
  Até passar, `video_data` e `advideos` são hipóteses, não fatos.
- Primeira chamada real à ElevenLabs. Confirmar o formato do TTS, se a criação funciona sem webhook
  (o guia diz que a workspace precisa de webhook; a referência da API diz que é opcional), o limite
  de duração do áudio e se `content_url` dispensa autenticação.
- Rótulo de conteúdo gerado por IA conforme a política atual da Meta.
- Nome e amostra das vozes na tela (hoje aparecem como "Voz 1", "Voz 2").

## Como reverter

Remover `ELEVENLABS_API_KEY` do ambiente. O provedor deixa de existir e nada é gerado.
As migrations são aditivas: não remova as duas em um ambiente que já foi usado. Peças com vídeo
voltam a ser publicadas como imagem quando o vídeo é tirado (`video_id = null`). Campanhas já
publicadas não mudam.
