// Batida original (120 BPM) gerada com o ffmpeg, sem direitos autorais: bumbo, palma, chimbal, baixo e um
// arpejo simples. Serve até existir a trilha da ElevenLabs (permissão music_generation).
// Uso: FFMPEG=... node scripts/batida.mjs [segundos]  ->  public/musica-reels.mp3
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const dur = Number(process.argv[2] ?? 45);
const B = 0.5; // um tempo a 120 BPM

const acorde = "mod(floor(t/2),4)";
const baixoHz = `if(eq(${acorde},0),55,if(eq(${acorde},1),43.65,if(eq(${acorde},2),65.41,49)))`;
const arpejo = `if(eq(mod(floor(t*4),4),0),523.25,if(eq(mod(floor(t*4),4),1),659.25,if(eq(mod(floor(t*4),4),2),783.99,659.25)))`;

const bumbo = `0.95*sin(2*PI*t*(45+90*exp(-30*mod(t,${B}))))*exp(-7*mod(t,${B}))`;
const chimbal = `0.10*(random(0)*2-1)*exp(-90*mod(t+${B / 2},${B}))`;
const palma = `0.30*(random(1)*2-1)*exp(-22*mod(t-${B},${2 * B}))*gte(t,${B})`;
const baixo = `0.30*sin(2*PI*(${baixoHz})*t)*(0.55+0.45*exp(-6*mod(t,${B})))`;
const pluck = `0.10*sin(2*PI*(${arpejo})*((${baixoHz})/55)*t)*exp(-14*mod(t,0.25))`;
// Entra em 0,5 s e sai em 1,5 s.
const envelope = `min(1,t/0.5)*min(1,(${dur}-t)/1.5)`;
const expr = `(${bumbo}+${chimbal}+${palma}+${baixo}+${pluck})*${envelope}*0.8`;

const saida = fileURLToPath(new URL("../public/musica-reels.mp3", import.meta.url));
execFileSync(FFMPEG, [
  "-v",
  "error",
  "-y",
  // A fórmula vai entre aspas simples: as vírgulas dela não são separadores de filtro.
  "-f",
  "lavfi",
  "-i",
  `aevalsrc=exprs='${expr}':s=44100:d=${dur}`,
  "-af",
  "highpass=f=30,acompressor=threshold=-14dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-1.5",
  "-ac",
  "2",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "192k",
  saida,
]);
console.log(`ok: batida de ${dur}s em public/musica-reels.mp3`);
