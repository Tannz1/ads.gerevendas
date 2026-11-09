# Vídeos do GereVendas Ads

Projeto [Remotion](https://www.remotion.dev/) separado do app. As telas e as peças vêm dos componentes
da LP (`../src/components/marketing`), então o vídeo acompanha o produto.

| Composição | Formato | Para quê |
| --- | --- | --- |
| `Apresentacao` | 1920×1080 | Vídeo da LP: explica o app passo a passo |
| `ReelsUso` | 1080×1920 | Reels: o app em uso, como gravação de tela |

Negócio, preços e números são **de exemplo** e aparecem rotulados no vídeo.

## Passo a passo

```bash
cd video
npm install
# 1. Narração (ElevenLabs) com o tempo de cada palavra. O texto fica em roteiro.json.
#    A chave é lida de C:/Users/notebook/.gerevendas/elevenlabs.env (fora do projeto).
node scripts/voz.mjs apresentacao   # ou: uso
# 2. Prévia interativa
npm run studio
# 3. Render (no Windows, aponte o navegador: --browser-executable="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
npm run render:apresentacao
npm run render:reels
```

O vídeo publicado na LP fica em `../public/lp/apresentacao.mp4` (comprimido com ffmpeg, `-crf 27 -movflags +faststart`).

Licença: o Remotion é gratuito para empresas com até 3 pessoas; acima disso exige licença.
