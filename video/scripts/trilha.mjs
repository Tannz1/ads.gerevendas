// Trilha original e efeitos sonoros do Reels dinâmico (ElevenLabs Music e Sound Effects).
// Uso: node scripts/trilha.mjs [musica|efeitos|tudo]
// Saída: public/musica-reels.mp3 e public/sfx-*.mp3. A chave fica fora do projeto e nunca é impressa.
import { readFileSync, writeFileSync } from "node:fs";

const linha = readFileSync("C:/Users/notebook/.gerevendas/elevenlabs.env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("ELEVENLABS_API_KEY="));
const key = linha?.slice("ELEVENLABS_API_KEY=".length).trim();
if (!key) throw new Error("Chave da ElevenLabs não encontrada");
const alvo = process.argv[2] ?? "tudo";
const salvar = (nome, buf) => writeFileSync(new URL(`../public/${nome}`, import.meta.url), buf);

async function musica() {
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      prompt:
        "Upbeat Brazilian pop funk instrumental for a short social media ad, 118 BPM, punchy kick and claps, " +
        "bright plucked synth hook, playful percussion, energetic and positive, clean mix, no vocals, loopable ending",
      music_length_ms: 45000,
      force_instrumental: true,
    }),
  });
  if (!res.ok) return console.log("musica", res.status, (await res.text()).slice(0, 300));
  salvar("musica-reels.mp3", Buffer.from(await res.arrayBuffer()));
  console.log("ok musica");
}

const EFEITOS = {
  "sfx-whoosh": "fast clean whoosh transition swipe, short",
  "sfx-pop": "soft cartoon pop, bubbly, short",
  "sfx-clique": "single crisp mouse click",
  "sfx-notificacao": "friendly smartphone message notification chime, two notes",
  "sfx-impacto": "short punchy bass hit impact for text slam",
};

async function efeitos() {
  for (const [nome, texto] of Object.entries(EFEITOS)) {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: texto, duration_seconds: 1.2, prompt_influence: 0.6 }),
    });
    if (!res.ok) {
      console.log(nome, res.status, (await res.text()).slice(0, 200));
      continue;
    }
    salvar(`${nome}.mp3`, Buffer.from(await res.arrayBuffer()));
    console.log("ok", nome);
  }
}

if (alvo === "musica" || alvo === "tudo") await musica();
if (alvo === "efeitos" || alvo === "tudo") await efeitos();
