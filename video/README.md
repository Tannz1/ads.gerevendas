# Vídeos do GereVendas Ads

Projeto [Remotion](https://www.remotion.dev/) separado do app. As telas e as peças vêm dos componentes
da LP (`../src/components/marketing`), então o vídeo acompanha o produto.

| Composição | Formato | Para quê |
| --- | --- | --- |
| `ApresentacaoNova` / `Apresentacao` | 1920×1080 | Vídeo da LP no computador: explica o app passo a passo |
| `ApresentacaoVerticalNova` / `ApresentacaoVertical` | 1080×1920 | O mesmo vídeo para quem assiste no celular (texto maior) |
| `ReelsUsoNovo` / `ReelsUso` | 1080×1920 | Reels: o app em uso, como gravação de tela |

Cada vídeo tem duas versões com a mesma narração: a **nova** (sufixo `Nova`/`Novo`), com o cursor do mouse
clicando nas telas e a legenda que acende palavra por palavra, e a **clássica**, com o toque em círculo e a
legenda por frase. A LP usa a versão nova.

Negócio, preços e números são **de exemplo** e aparecem rotulados no vídeo.

## Passo a passo

```bash
cd video
npm install
# 1. Narração frase por frase (o texto fica em roteiro.json, em tom de conversa).
#    Voz aprovada: ElevenLabs oArP4WehPe3qjqvCwHNo, modelo eleven_multilingual_v2.
#    Precisa do ffmpeg/ffprobe (variáveis FFMPEG e FFPROBE, se não estiverem no PATH).
#    As chaves são lidas de C:/Users/notebook/.gerevendas/*.env (fora do projeto).
node scripts/voz-frases.mjs apresentacao eleven:oArP4WehPe3qjqvCwHNo:eleven_multilingual_v2
node scripts/voz-frases.mjs uso eleven:oArP4WehPe3qjqvCwHNo:eleven_multilingual_v2
# 2. Prévia interativa
npm run studio
# 3. Render (no Windows, aponte o navegador: --browser-executable="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
npm run render:apresentacao
npm run render:reels
```

O vídeo publicado na LP fica em `../public/lp/apresentacao.mp4` (comprimido com ffmpeg, `-crf 27 -movflags +faststart`).

Licença: o Remotion é gratuito para empresas com até 3 pessoas; acima disso exige licença.
