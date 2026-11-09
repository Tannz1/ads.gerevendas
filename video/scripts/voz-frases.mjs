// Narração humana frase por frase, em pt-BR, com a ElevenLabs ou a OpenAI.
// Uso: node scripts/voz-frases.mjs <apresentacao|uso> <voz>
//   ElevenLabs: eleven:<voice_id>[:<modelo>]   (modelo padrão eleven_v3, o mais expressivo)
//   OpenAI:     ash, cedar, coral, marin…       (gpt-4o-mini-tts, com instruções de tom)
// Saída: public/<nome>.mp3 e src/timeline-<nome>.json (cenas com frases e tempos em segundos).
// Cada frase é gerada à parte e medida com ffprobe: cenas e legendas batem com a fala.
// As chaves ficam em arquivos FORA do projeto e nunca são impressas nem gravadas aqui.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASTA_CHAVES = "C:/Users/notebook/.gerevendas";
function chave(arquivo, nome) {
  const texto = readFileSync(`${PASTA_CHAVES}/${arquivo}`, "utf8");
  const linha = texto.split(/\r?\n/).find((l) => l.startsWith(`${nome}=`));
  const valor = linha?.slice(nome.length + 1).trim();
  if (!valor) throw new Error(`Chave ${nome} não encontrada em ${PASTA_CHAVES}/${arquivo}`);
  return valor;
}

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE ?? "ffprobe";

const nome = process.argv[2];
const voz = process.argv[3] ?? "ash";
const [provedor, vozId, modelo = "eleven_v3"] = voz.startsWith("eleven:") ? voz.split(":") : ["openai", voz];
const roteiro = JSON.parse(readFileSync(new URL("../roteiro.json", import.meta.url), "utf8"))[nome];
if (!roteiro) throw new Error("Use: node scripts/voz-frases.mjs <apresentacao|uso> <voz>");

const INSTRUCOES =
  roteiro.instrucoes ??
  "Fale em português do Brasil com sotaque brasileiro natural, como um amigo explicando algo pelo celular. " +
    "Tom caloroso, simpático e confiante, ritmo de conversa, com pequenas pausas naturais. Nada de tom de locutor nem robótico.";
const PAUSA_FRASE = roteiro.pausaFrase ?? 0.25;
const PAUSA_CENA = roteiro.pausaCena ?? 0.5;

const tmp = mkdtempSync(path.join(tmpdir(), "voz-"));
const frases = roteiro.cenas.flatMap((c) =>
  c.texto
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .map((texto) => ({ cena: c.id, texto })),
);

async function pedir(texto) {
  if (provedor === "eleven") {
    // MP3 funciona em todos os planos (PCM exige o Pro); o ffmpeg converte para WAV.
    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave("elevenlabs.env", "ELEVENLABS_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({
        text: texto,
        model_id: modelo,
        language_code: "pt",
        // Ajustes da amostra aprovada (multilingual v2): natural, sem exagero.
        ...(modelo === "eleven_multilingual_v2" && {
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true,
            speed: roteiro.velocidade ?? 1,
          },
        }),
      }),
    });
  }
  return fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${chave("openai.env", "OPENAI_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: vozId,
      input: texto,
      instructions: INSTRUCOES,
      response_format: "wav",
    }),
  });
}

async function gerar(f, i) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await pedir(f.texto);
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      f.arquivo = path.join(tmp, `${String(i).padStart(3, "0")}.wav`);
      if (provedor === "eleven") {
        const mp3 = f.arquivo.replace(/\.wav$/, ".mp3");
        writeFileSync(mp3, bytes);
        execFileSync(FFMPEG, ["-v", "error", "-y", "-i", mp3, f.arquivo]);
      } else {
        writeFileSync(f.arquivo, bytes);
      }
      f.duracao = Number(
        execFileSync(FFPROBE, [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          f.arquivo,
        ]).toString(),
      );
      return;
    }
    const erro = `${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (tentativa === 3) throw new Error(`TTS falhou na frase ${i + 1} (${erro})`);
    await new Promise((r) => setTimeout(r, 2000 * tentativa));
  }
}

// 3 frases por vez, para não estourar o limite das APIs.
for (let i = 0; i < frases.length; i += 3) {
  await Promise.all(frases.slice(i, i + 3).map((f, k) => gerar(f, i + k)));
}

// Linha do tempo: cada frase entra depois da anterior, com pausas curtas.
let t = 0.3;
const cenas = roteiro.cenas.map((c) => ({ id: c.id, ini: 0, fim: 0, palavras: [] }));
frases.forEach((f, i) => {
  const cena = cenas.find((c) => c.id === f.cena);
  if (!cena.palavras.length) cena.ini = t;
  cena.palavras.push({ texto: f.texto, ini: t, fim: t + f.duracao });
  f.ini = t;
  t += f.duracao;
  const proxima = frases[i + 1];
  if (proxima) t += proxima.cena === f.cena ? PAUSA_FRASE : PAUSA_CENA;
});
cenas.forEach((c, i) => {
  c.fim = cenas[i + 1] ? cenas[i + 1].ini : t + 0.8;
});
const duracao = t + 1.2;

// Junta tudo numa faixa só: cada frase no seu tempo (adelay) e soma (amix).
const entradas = frases.flatMap((f) => ["-i", f.arquivo]);
const atrasos = frases.map((f, i) => `[${i}]adelay=${Math.round(f.ini * 1000)}:all=1[a${i}]`).join(";");
const mix = `${frases.map((_, i) => `[a${i}]`).join("")}amix=inputs=${frases.length}:normalize=0,apad=whole_dur=${duracao.toFixed(2)},loudnorm=I=-14:TP=-1.5,aresample=44100[out]`;
const saida = fileURLToPath(new URL(`../public/${nome}.mp3`, import.meta.url));
execFileSync(FFMPEG, [
  "-v",
  "error",
  "-y",
  ...entradas,
  "-filter_complex",
  `${atrasos};${mix}`,
  "-map",
  "[out]",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "160k",
  saida,
]);

writeFileSync(
  new URL(`../src/timeline-${nome}.json`, import.meta.url),
  JSON.stringify({ voz, duracao, cenas }, null, 2),
);
console.log(`ok: ${nome} com ${frases.length} frases, ${duracao.toFixed(1)} s, voz ${voz}`);
