/** Tipos da narração gerada por scripts/voz.mjs (tempos em segundos). */
export type Palavra = { texto: string; ini: number; fim: number };
export type Cena = { id: string; ini: number; fim: number; palavras: Palavra[] };
