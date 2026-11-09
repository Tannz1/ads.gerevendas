// Gera a narração de um vídeo na ElevenLabs, com o tempo de cada palavra.
// Uso: node scripts/voz.mjs <reels|vsl> [voice_id]
// Saída: public/<nome>.mp3 e src/timeline-<nome>.json (cenas e palavras em segundos).
// A chave vem de um arquivo FORA do projeto e nunca é impressa nem gravada aqui.
import { readFileSync, writeFileSync } from "node:fs";

const KEY_FILE = "C:/Users/notebook/.gerevendas/elevenlabs.env";
const key = readFileSync(KEY_FILE, "utf8").match(/ELEVENLABS_API_KEY=(\S+)/)?.[1];
if (!key) throw new Error(`Chave da ElevenLabs não encontrada em ${KEY_FILE}`);

const nome = process.argv[2];
const voice = process.argv[3] ?? "pNInz6obpgDQGcFmaJgB";
const roteiro = JSON.parse(readFileSync(new URL("../roteiro.json", import.meta.url), "utf8"))[nome];
if (!roteiro) throw new Error("Use: node scripts/voz.mjs <reels|vsl> [voice_id]");

// Uma frase por cena, separadas por espaço: a fala sai contínua e cada cena tem a sua faixa de caracteres.
let texto = "";
const faixas = roteiro.cenas.map((c) => {
  const ini = texto.length + (texto ? 1 : 0);
  texto += (texto ? " " : "") + c.texto;
  return { id: c.id, ini, fim: texto.length };
});

const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
  {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text: texto,
      model_id: "eleven_multilingual_v2",
      language_code: "pt",
      voice_settings: roteiro.voz ?? {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.45,
        use_speaker_boost: true,
        speed: 1.05,
      },
    }),
  },
);
if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
const json = await res.json();
writeFileSync(new URL(`../public/${nome}.mp3`, import.meta.url), Buffer.from(json.audio_base64, "base64"));

const a = json.alignment;
const chars = a.characters;
// Palavras: sequências sem espaço, com início e fim pelo tempo dos caracteres.
const palavras = [];
let i = 0;
while (i < chars.length) {
  if (/\s/.test(chars[i])) {
    i++;
    continue;
  }
  const ini = i;
  while (i < chars.length && !/\s/.test(chars[i])) i++;
  palavras.push({
    texto: chars.slice(ini, i).join(""),
    pos: ini,
    ini: a.character_start_times_seconds[ini],
    fim: a.character_end_times_seconds[i - 1],
  });
}
const cenas = faixas.map((f, k) => {
  const ws = palavras.filter((w) => w.pos >= f.ini && w.pos < f.fim);
  const proxima = faixas[k + 1] ? palavras.find((w) => w.pos >= faixas[k + 1].ini) : null;
  return {
    id: f.id,
    ini: ws[0]?.ini ?? 0,
    // A cena vai até a próxima fala começar (inclui a pausa entre frases).
    fim: proxima ? proxima.ini : (ws.at(-1)?.fim ?? 0) + 0.8,
    palavras: ws.map(({ texto, ini, fim }) => ({ texto, ini, fim })),
  };
});
const duracao = a.character_end_times_seconds.at(-1) + 1.2;
writeFileSync(
  new URL(`../src/timeline-${nome}.json`, import.meta.url),
  JSON.stringify({ voz: voice, duracao, cenas }, null, 2),
);
console.log(`ok: ${nome} com ${cenas.length} cenas, ${duracao.toFixed(1)} s`);
